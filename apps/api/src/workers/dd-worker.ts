import { Worker, Job, Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { getDefectDojoClient } from '../lib/defectdojo.js';
import { computeDedupHash } from '../utils/dedup.js';
import type { DdSyncJobData } from '../lib/queue.js';
import { Severity, FindingStatus } from '@prisma/client';

function mapSeverity(level: string): Severity {
  const l = level.toLowerCase().trim();
  if (['critical', 'blocker', 'urgent'].includes(l)) return Severity.CRITICAL;
  if (['high', 'major', 'important'].includes(l)) return Severity.HIGH;
  if (['medium', 'moderate', 'normal'].includes(l)) return Severity.MEDIUM;
  if (['low', 'minor'].includes(l)) return Severity.LOW;
  return Severity.INFO;
}

function mapStatus(ddFinding: any): FindingStatus {
  if (ddFinding.false_p) return FindingStatus.FALSE_POSITIVE;
  if (!ddFinding.active) return FindingStatus.RESOLVED;
  if (ddFinding.verified) return FindingStatus.CONFIRMED;
  return FindingStatus.NEW;
}

async function pullFromDefectDojo(_job: Job) {
  console.log('[DD Worker] Running DefectDojo pull sync...');

  const dd = getDefectDojoClient();
  if (!dd.enabled) {
    return { skipped: true, reason: 'not_enabled' };
  }

  const projects = await prisma.project.findMany({
    where: {
      defectdojoProductId: { not: null },
    },
    select: { id: true, defectdojoProductId: true, name: true },
  });

  if (projects.length === 0) {
    return { skipped: true, reason: 'no_projects' };
  }

  let totalNew = 0;
  let totalUpdated = 0;

  for (const project of projects) {
    const productId = Number(project.defectdojoProductId);
    try {
      const { new: newCount, updated: updatedCount } = await syncFindingsFromDD(
        project.id,
        productId
      );
      totalNew += newCount;
      totalUpdated += updatedCount;
    } catch (err) {
      console.error(`[DD Worker] Pull failed for project ${project.name}:`, err);
    }
  }

  console.log(`[DD Worker] Pull sync complete. New: ${totalNew}, Updated: ${totalUpdated}`);
  return { new: totalNew, updated: totalUpdated, projects: projects.length };
}

async function syncFindingsFromDD(projectId: string, productId: number): Promise<{ new: number; updated: number }> {
  const dd = getDefectDojoClient();

  const findingsResp = await dd.listFindings({
    product: productId,
    active: true,
    limit: 500,
  });

  const findings = findingsResp.results;

  let newCount = 0;
  let updatedCount = 0;

  for (const ddFinding of findings) {
    const severity = mapSeverity(ddFinding.severity);
    const status = mapStatus(ddFinding);
    const title = ddFinding.title;
    const description = ddFinding.description || '';
    const location = ddFinding.url || ddFinding.file_path || undefined;
    const filePath = ddFinding.file_path || undefined;
    const lineStart = ddFinding.line ? Number(ddFinding.line) : undefined;
    const cwe = ddFinding.cwe ? `CWE-${ddFinding.cwe}` : undefined;
    const cve = ddFinding.cve || undefined;
    const cvss = ddFinding.cvssv3_score ? Number(ddFinding.cvssv3_score) : undefined;

    const dedupHash = computeDedupHash({
      title,
      location: location || filePath || 'unknown',
      cwe,
    });
    const scannerRef = ddFinding.id ? String(ddFinding.id) : undefined;

    const existing = await prisma.finding.findFirst({
      where: {
        projectId,
        dedupHash,
      },
    });

    if (existing) {
      if (existing.status !== status || existing.severity !== severity) {
        await prisma.finding.update({
          where: { id: existing.id },
          data: {
            status,
            severity,
            scannerRef,
            cwe,
            cve,
            cvss,
          },
        });
        updatedCount++;
      }
    } else {
      await prisma.finding.create({
        data: {
          projectId,
          title,
          description,
          severity,
          status,
          location,
          filePath,
          lineStart,
          cwe,
          cve,
          cvss,
          dedupHash,
          scannerRef,
          source: 'DEFECTDOJO',
        },
      });
      newCount++;
    }
  }

  return { new: newCount, updated: updatedCount };
}

async function processDdSyncJob(job: Job<DdSyncJobData>) {
  const { projectId, scanType, scanTaskId, findings } = job.data;

  console.log(`[DD Worker] Syncing ${findings.length} findings for scan ${scanTaskId}`);

  const dd = getDefectDojoClient();
  if (!dd.enabled) {
    console.log('[DD Worker] DefectDojo not enabled, skipping');
    return { skipped: true, reason: 'not_enabled' };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { defectdojoProductId: true, name: true },
  });

  if (!project?.defectdojoProductId) {
    console.log('[DD Worker] No DefectDojo product ID, skipping');
    return { skipped: true, reason: 'no_product_id' };
  }

  const productId = project.defectdojoProductId;
  const engagementName = `CI/CD Pipeline - ${new Date().toISOString().split('T')[0]}`;

  const engagement = await dd.getOrCreateEngagement(productId, engagementName);

  const ddFindings = findings.map((f) => ({
    title: f.title,
    description: f.description,
    severity: f.severity,
    cwe: f.cwe ? parseInt(f.cwe.replace(/\D/g, ''), 10) : undefined,
    cve: f.cve,
    cvssv3_score: f.cvss,
    file_path: f.filePath,
    line: f.lineStart,
    url: f.location?.startsWith('http') ? f.location : undefined,
    unique_id_from_tool: f.scannerRef,
  }));

  if (ddFindings.length === 0) {
    return { skipped: true, reason: 'no_findings' };
  }

  const result = await dd.importScanResult(engagement.id, scanType, ddFindings);

  console.log(`[DD Worker] Synced ${result.created} findings to DefectDojo (test ${result.testId})`);

  await prisma.scanTask.update({
    where: { id: scanTaskId },
    data: {
      defectdojoSynced: true,
      defectdojoTestId: String(result.testId),
    },
  });

  return { created: result.created, testId: result.testId };
}

function startWorker() {
  console.log('[DD Worker] Starting DefectDojo sync worker...');

  const worker = new Worker('dd-sync-queue', async (job: Job) => {
    if (job.name === 'dd-pull') {
      return pullFromDefectDojo(job);
    }
    return processDdSyncJob(job as Job<DdSyncJobData>);
  }, {
    connection: {
      url: config.REDIS_URL,
    },
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`[DD Worker] Job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[DD Worker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  (async () => {
    const queue = new Queue('dd-sync-queue', {
      connection: { url: config.REDIS_URL },
    });

    await queue.add('dd-pull', {}, {
      repeat: {
        pattern: '0 * * * *',
      },
      jobId: 'dd-pull-hourly',
    });

    await queue.close();
  })().catch((err) => {
    console.warn('[DD Worker] Failed to schedule pull job:', err.message);
  });

  console.log('[DD Worker] DefectDojo sync worker started');
}

if (process.argv[1]?.includes('dd-worker')) {
  startWorker();
}

export { startWorker, processDdSyncJob };
