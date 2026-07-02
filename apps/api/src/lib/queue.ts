import { Queue } from 'bullmq';
import { config } from '../config.js';

let scanQueue: Queue | null = null;
let ddSyncQueue: Queue | null = null;

export function getScanQueue(): Queue {
  if (!scanQueue) {
    scanQueue = new Queue('scan-queue', {
      connection: {
        url: config.REDIS_URL,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return scanQueue;
}

export function getDdSyncQueue(): Queue {
  if (!ddSyncQueue) {
    ddSyncQueue = new Queue('dd-sync-queue', {
      connection: {
        url: config.REDIS_URL,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 200,
        removeOnFail: 1000,
      },
    });
  }
  return ddSyncQueue;
}

export interface ScanJobData {
  scanTaskId: string;
  projectId: string;
  scanType: string;
  targetUrl?: string;
  branch?: string;
  commitHash?: string;
  triggeredBy: string;
  traceId?: string;
}

export interface DdSyncJobData {
  projectId: string;
  scanType: string;
  scanTaskId: string;
  findings: Array<{
    title: string;
    severity: string;
    cwe?: string;
    cve?: string;
    cvss?: number;
    description: string;
    filePath?: string;
    lineStart?: number;
    location?: string;
    scannerRef?: string;
  }>;
}

export async function addScanJob(data: ScanJobData): Promise<string> {
  const queue = getScanQueue();
  const job = await queue.add(`scan:${data.scanType}`, data, {
    jobId: data.scanTaskId,
  });
  return job.id as string;
}

export async function addDdSyncJob(data: DdSyncJobData): Promise<string> {
  const queue = getDdSyncQueue();
  const job = await queue.add(`dd-sync:${data.scanType}`, data, {
    jobId: `dd:${data.scanTaskId}`,
  });
  return job.id as string;
}

export async function getQueueStats() {
  const scanQueue = getScanQueue();
  const ddQueue = getDdSyncQueue();
  const [
    waiting, active, completed, failed, delayed,
    ddWaiting, ddActive, ddCompleted, ddFailed,
  ] = await Promise.all([
    scanQueue.getWaitingCount(),
    scanQueue.getActiveCount(),
    scanQueue.getCompletedCount(),
    scanQueue.getFailedCount(),
    scanQueue.getDelayedCount(),
    ddQueue.getWaitingCount(),
    ddQueue.getActiveCount(),
    ddQueue.getCompletedCount(),
    ddQueue.getFailedCount(),
  ]);
  return {
    scan: { waiting, active, completed, failed, delayed },
    defectDojo: { waiting: ddWaiting, active: ddActive, completed: ddCompleted, failed: ddFailed },
  };
}
