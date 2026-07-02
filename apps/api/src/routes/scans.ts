import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { addScanJob } from '../lib/queue.js';
import { ScanType, ScanStatus, PipelineStage } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const createScanSchema = z.object({
  projectId: z.string(),
  type: z.nativeEnum(ScanType),
  pipelineStage: z.nativeEnum(PipelineStage).optional(),
  targetUrl: z.string().url().optional(),
  branch: z.string().optional(),
  commitHash: z.string().optional(),
});

const scanQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().optional(),
  status: z.nativeEnum(ScanStatus).optional(),
  type: z.nativeEnum(ScanType).optional(),
  pipelineStage: z.nativeEnum(PipelineStage).optional(),
});

const scansRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/scans', async (request) => {
    const query = scanQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.pipelineStage) where.pipelineStage = query.pipelineStage;

    const [scans, total] = await Promise.all([
      prisma.scanTask.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { triggeredAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, productId: true },
          },
        },
      }),
      prisma.scanTask.count({ where }),
    ]);

    return {
      data: scans,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/scans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const scan = await prisma.scanTask.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, productId: true },
        },
        findings: {
          take: 10,
          orderBy: { severity: 'desc' },
        },
        _count: {
          select: { findings: true },
        },
      },
    });

    if (!scan) {
      return reply.status(404).send({ error: 'Scan not found' });
    }

    return scan;
  });

  fastify.post('/api/scans', async (request, reply) => {
    const body = createScanSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const traceId = randomUUID();

    const scanTask = await prisma.scanTask.create({
      data: {
        type: body.type,
        status: ScanStatus.PENDING,
        projectId: body.projectId,
        pipelineStage: body.pipelineStage,
        targetUrl: body.targetUrl,
        branch: body.branch,
        commitHash: body.commitHash,
        triggeredBy: request.user.userId,
        traceId,
      },
    });

    await addScanJob({
      scanTaskId: scanTask.id,
      projectId: body.projectId,
      scanType: body.type,
      targetUrl: body.targetUrl,
      branch: body.branch,
      commitHash: body.commitHash,
      triggeredBy: request.user.userId,
      traceId,
    });

    await prisma.auditLog.create({
      data: {
        action: 'scan.trigger',
        userId: request.user.userId,
        projectId: body.projectId,
        metadata: {
          scanId: scanTask.id,
          scanType: body.type,
          traceId,
        },
      },
    });

    return reply.status(201).send(scanTask);
  });

  fastify.get('/api/scans/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };

    const scan = await prisma.scanTask.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        durationSeconds: true,
        findingsCritical: true,
        findingsHigh: true,
        findingsMedium: true,
        findingsLow: true,
        findingsInfo: true,
        errorMessage: true,
      },
    });

    if (!scan) {
      return reply.status(404).send({ error: 'Scan not found' });
    }

    return scan;
  });

  fastify.post('/api/scans/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };

    const scan = await prisma.scanTask.findUnique({ where: { id } });
    if (!scan) {
      return reply.status(404).send({ error: 'Scan not found' });
    }

    if (scan.status !== ScanStatus.PENDING && scan.status !== ScanStatus.RUNNING) {
      return reply.status(400).send({ error: 'Cannot cancel scan in current status' });
    }

    const updated = await prisma.scanTask.update({
      where: { id },
      data: {
        status: ScanStatus.CANCELLED,
        completedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'scan.cancel',
        userId: request.user.userId,
        projectId: scan.projectId,
        metadata: { scanId: id },
      },
    });

    return updated;
  });

  fastify.get('/api/scans/:id/findings', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
      severity: z.string().optional(),
      falsePositive: z.coerce.boolean().optional(),
    }).parse(request.query);

    const scan = await prisma.scanTask.findUnique({ where: { id } });
    if (!scan) {
      return reply.status(404).send({ error: 'Scan not found' });
    }

    const skip = (query.page - 1) * query.pageSize;
    const where: Record<string, unknown> = { scanId: id };
    if (query.severity) where.severity = query.severity;
    if (query.falsePositive !== undefined) where.falsePositive = query.falsePositive;

    const [findings, total] = await Promise.all([
      prisma.finding.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [
          { severity: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.finding.count({ where }),
    ]);

    return {
      data: findings,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });
};

export default scansRoutes;
