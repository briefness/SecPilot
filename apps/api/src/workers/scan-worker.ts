import { Worker, Job } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { computeDedupHash } from '../utils/dedup.js';
import { ScanStatus, Severity, ScanType } from '@prisma/client';
import { runScanner, ScannerFinding } from '../scanners/index.js';
import { addDdSyncJob, isJobCancelled } from '../lib/queue.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

const STATIC_SCANNERS = new Set<ScanType>([ScanType.STATIC_SAST, ScanType.STATIC_SCA]);

const LOCKFILE_PATTERNS = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'Pipfile.lock',
  'poetry.lock',
  'requirements.txt',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
  'Cargo.lock',
  'mix.lock',
  'pubspec.lock',
];

async function cloneRepo(gitRepo: string, branch?: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'secscan-'));
  const args = ['clone', '--depth', '1', '--single-branch'];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push(gitRepo, tmpDir);

  try {
    await execFileAsync('git', args, { timeout: 120000 });
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true });
    const stderr = err?.stderr || err?.message || '';
    if (stderr.includes('Authentication failed') || stderr.includes('Permission denied') || stderr.includes('could not read Username')) {
      throw new Error(`Git 仓库克隆失败：认证失败。若是私有仓库，请在仓库地址中携带 token（如 https://token@github.com/org/repo.git），或配置 git credential helper。`);
    }
    if (stderr.includes('not found')) {
      throw new Error(`Git 仓库克隆失败：仓库不存在或无访问权限。`);
    }
    throw new Error(`Git 仓库克隆失败：${stderr || err.message}`);
  }

  return tmpDir;
}

async function findLockfile(repoDir: string): Promise<string | null> {
  for (const pattern of LOCKFILE_PATTERNS) {
    const filePath = join(repoDir, pattern);
    try {
      await access(filePath, constants.R_OK);
      return filePath;
    } catch {
      // not found, try next
    }
  }
  return null;
}

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
    const lineStart = f.lineStart ?? undefined;
    const lineEnd = f.lineEnd ?? undefined;

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

  console.log(`[Scan Worker] Starting scan ${scanTaskId} (${scanType}) attempt ${job.attemptsMade + 1} for project ${projectId}`);

  let repoDir: string | null = null;

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

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { gitRepo: true, name: true },
    });

    const extraParams: Record<string, unknown> = {
      projectId,
      ...(scannerConfig.defaultParams as Record<string, unknown>),
    };

    if (STATIC_SCANNERS.has(scanType as ScanType) && project?.gitRepo) {
      console.log(`[Scan Worker] Cloning repo for ${scanType}: ${project.gitRepo}`);
      repoDir = await cloneRepo(project.gitRepo, branch);
      extraParams.directory = repoDir;

      if (scanType === ScanType.STATIC_SCA) {
        const lockfilePath = await findLockfile(repoDir);
        if (lockfilePath) {
          console.log(`[Scan Worker] Found lockfile: ${lockfilePath}`);
          extraParams.lockfilePath = lockfilePath;
        }
      }
    }

    const result = await runScanner(scanType, {
      targetUrl,
      branch,
      commitHash,
      traceId,
      extraParams,
    });

    if (!result.success) {
      throw new Error(result.error || 'Scanner failed');
    }

    const cancelled = await isJobCancelled(scanTaskId);
    if (cancelled) {
      await prisma.scanTask.update({
        where: { id: scanTaskId },
        data: {
          status: ScanStatus.CANCELLED,
          completedAt: new Date(),
        },
      });
      return { success: true, scanTaskId, cancelled: true };
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
    console.error(`[Scan Worker] Scan ${scanTaskId} failed (attempt ${job.attemptsMade + 1}):`, error);

    const isFinalAttempt = job.attemptsMade >= 2;
    if (isFinalAttempt) {
      await prisma.scanTask.update({
        where: { id: scanTaskId },
        data: {
          status: ScanStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }

    throw error;
  } finally {
    if (repoDir) {
      rm(repoDir, { recursive: true, force: true }).catch((err) => {
        console.warn(`[Scan Worker] Failed to clean up repo dir ${repoDir}:`, err.message);
      });
    }
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
