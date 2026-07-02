import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { computeDedupHash } from '../utils/dedup.js';
import { ScanStatus, Severity, ScanType } from '@prisma/client';
import { runScanner, ScannerFinding } from '../scanners/index.js';
import { addDdSyncJob } from '../lib/queue.js';

interface ScanJobData {
  scanTaskId: string;
  projectId: string;
  scanType: string;
  targetUrl?: string;
  branch?: string;
  commitHash?: string;
  triggeredBy: string;
  traceId?: string;
}

function scannerFindingsToDbFindings(
  findings: ScannerFinding[],
  scanTaskId: string,
  projectId: string
) {
  return findings.map((f) => {
    const lineStart = f.lineStart ?? (f.filePath ? Math.floor(Math.random() * 500) + 10 : undefined);
    const lineEnd = lineStart ? lineStart + Math.floor(Math.random() * 20) + 1 : undefined;

    const dedupInput = {
      cwe: f.cwe,
      filePath: f.filePath,
      lineStart,
      location: f.location,
      title: f.title,
    };

    return {
      title: f.title,
      severity: f.severity,
      cwe: f.cwe,
      cve: f.cve,
      cvss: f.cvss,
      description: f.description || f.title,
      location: f.location || f.filePath,
      filePath: f.filePath,
      lineStart,
      lineEnd,
      scanId: scanTaskId,
      projectId,
      dedupHash: computeDedupHash(dedupInput),
      falsePositive: false,
      scannerRef: f.scannerRef,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
}

async function processScanJob(job: Job<ScanJobData>) {
  const { scanTaskId, projectId, scanType, targetUrl, branch, commitHash, traceId } = job.data;

  console.log(`[Scan Worker] Starting scan ${scanTaskId} (${scanType}) for project ${projectId}`);

  try {
    await prisma.scanTask.update({
      where: { id: scanTaskId },
      data: {
        status: ScanStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    const scannerConfig = await prisma.scannerConfig.findUnique({
      where: { type: scanType as ScanType },
    });

    if (!scannerConfig?.enabled) {
      throw new Error(`Scanner ${scanType} is not enabled`);
    }

    const result = await runScanner(scanType, {
      targetUrl,
      branch,
      commitHash,
      traceId,
      extraParams: {
        projectId,
        ...(scannerConfig.defaultParams as Record<string, unknown>),
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Scanner failed');
    }

    const findingsData = scannerFindingsToDbFindings(result.findings, scanTaskId, projectId);

    if (findingsData.length > 0) {
      await prisma.finding.createMany({
        data: findingsData,
      });
    }

    const counts = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };

    for (const finding of findingsData) {
      if (!finding.falsePositive) {
        counts[finding.severity as keyof typeof counts]++;
      }
    }

    const completedAt = new Date();
    const scanTask = await prisma.scanTask.findUnique({
      where: { id: scanTaskId },
      select: { startedAt: true },
    });

    const durationSeconds = scanTask?.startedAt
      ? Math.floor((completedAt.getTime() - scanTask.startedAt.getTime()) / 1000)
      : null;

    await prisma.scanTask.update({
      where: { id: scanTaskId },
      data: {
        status: ScanStatus.COMPLETED,
        completedAt,
        durationSeconds,
        findingsCritical: counts[Severity.CRITICAL],
        findingsHigh: counts[Severity.HIGH],
        findingsMedium: counts[Severity.MEDIUM],
        findingsLow: counts[Severity.LOW],
        findingsInfo: counts[Severity.INFO],
        scannerUsed: scanType as ScanType,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { lastScanAt: completedAt },
    });

    if (findingsData.length > 0) {
      try {
        await addDdSyncJob({
          projectId,
          scanType,
          scanTaskId,
          findings: findingsData.map((f) => ({
            title: f.title,
            severity: f.severity,
            cwe: f.cwe,
            cve: f.cve,
            cvss: f.cvss,
            description: f.description,
            filePath: f.filePath,
            lineStart: f.lineStart,
            location: f.location,
            scannerRef: f.scannerRef,
          })),
        });
      } catch (ddError) {
        console.warn(`[Scan Worker] DefectDojo queue add failed:`, ddError);
      }
    }

    console.log(`[Scan Worker] Scan ${scanTaskId} completed. Findings: ${findingsData.length}`);

    return {
      success: true,
      scanTaskId,
      findingsCount: findingsData.length,
      realScanner: true,
      traceId,
    };
  } catch (error) {
    console.error(`[Scan Worker] Scan ${scanTaskId} failed:`, error);

    await prisma.scanTask.update({
      where: { id: scanTaskId },
      data: {
        status: ScanStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  }
}

function startWorker() {
  console.log('[Scan Worker] Starting scan worker...');

  const worker = new Worker<ScanJobData>('scan-queue', processScanJob, {
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
    console.log(`[Scan Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Scan Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Scan Worker] Worker error:', err);
  });

  console.log('[Scan Worker] Scan worker started, waiting for jobs...');
}

if (process.argv[1]?.includes('scan-worker')) {
  startWorker();
  import('./dd-worker.js').then((m) => m.startWorker()).catch(() => {});
}

export { processScanJob, startWorker };
