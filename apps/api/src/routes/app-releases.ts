import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ReleaseStatus, ScanType, PipelineStage, UserRole } from '@prisma/client';

const createReleaseSchema = z.object({
  projectId: z.string(),
  version: z.string().min(1).max(50),
  buildNumber: z.string().min(1).max(50),
  platform: z.enum(['android', 'ios', 'harmony']),
  artifactUrl: z.string().url().optional(),
  preHardeningHash: z.string().min(1).max(128),
});

const updateReleaseSchema = z.object({
  status: z.nativeEnum(ReleaseStatus).optional(),
  postHardeningHash: z.string().min(1).max(128).optional(),
  scanTaskId: z.string().optional(),
  findingsCritical: z.number().int().min(0).optional(),
  findingsHigh: z.number().int().min(0).optional(),
  findingsMedium: z.number().int().min(0).optional(),
  findingsLow: z.number().int().min(0).optional(),
  mobsfReportUrl: z.string().url().optional(),
});

const releaseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().optional(),
  status: z.nativeEnum(ReleaseStatus).optional(),
  platform: z.enum(['android', 'ios', 'harmony']).optional(),
  version: z.string().optional(),
});

const verifyHashSchema = z.object({
  hash: z.string().min(1).max(128),
  expectedHash: z.string().min(1).max(128).optional(),
  releaseId: z.string().optional(),
});

const appReleaseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/app-releases', async (request) => {
    const query = releaseQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.platform) where.platform = query.platform;
    if (query.version) where.version = { contains: query.version, mode: 'insensitive' };

    const [releases, total] = await Promise.all([
      prisma.appRelease.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, productId: true },
          },
          scanTask: {
            select: { id: true, type: true, status: true, triggeredAt: true },
          },
        },
      }),
      prisma.appRelease.count({ where }),
    ]);

    return {
      data: releases,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/app-releases/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const release = await prisma.appRelease.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, productId: true, gitRepo: true },
        },
        scanTask: true,
      },
    });

    if (!release) {
      return reply.status(404).send({ error: 'Release not found' });
    }

    return release;
  });

  fastify.post('/api/app-releases', async (request, reply) => {
    const body = createReleaseSchema.parse(request.body);

    const existing = await prisma.appRelease.findUnique({
      where: {
        projectId_version_buildNumber_platform: {
          projectId: body.projectId,
          version: body.version,
          buildNumber: body.buildNumber,
          platform: body.platform,
        },
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Release already exists for this version/build/platform' });
    }

    const release = await prisma.appRelease.create({
      data: {
        ...body,
        triggeredBy: request.user.userId,
      },
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'app_release.create',
        userId: request.user.userId,
        projectId: body.projectId,
        metadata: {
          releaseId: release.id,
          version: body.version,
          buildNumber: body.buildNumber,
          platform: body.platform,
          preHardeningHash: body.preHardeningHash,
        },
      },
    });

    return reply.status(201).send(release);
  });

  fastify.patch('/api/app-releases/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateReleaseSchema.parse(request.body);

    const release = await prisma.appRelease.findUnique({ where: { id } });
    if (!release) {
      return reply.status(404).send({ error: 'Release not found' });
    }

    const data: Record<string, unknown> = { ...body };
    if (body.status === ReleaseStatus.HARDENED) data.hardenedAt = new Date();
    if (body.status === ReleaseStatus.PUBLISHED) data.publishedAt = new Date();

    const updated = await prisma.appRelease.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'app_release.update',
        userId: request.user.userId,
        projectId: release.projectId,
        metadata: { releaseId: id, changes: body },
      },
    });

    return updated;
  });

  fastify.post('/api/app-releases/:id/trigger-scan', async (request, reply) => {
    const { id } = request.params as { id: string };

    const release = await prisma.appRelease.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!release) {
      return reply.status(404).send({ error: 'Release not found' });
    }

    const scanTask = await prisma.scanTask.create({
      data: {
        type: ScanType.MOBILE_MOBSF,
        status: 'PENDING',
        projectId: release.projectId,
        pipelineStage: PipelineStage.RELEASE_AUDIT,
        targetUrl: release.artifactUrl,
        triggeredBy: request.user.userId,
      },
    });

    const updated = await prisma.appRelease.update({
      where: { id },
      data: {
        scanTaskId: scanTask.id,
        status: ReleaseStatus.SCANNING,
      },
      include: {
        scanTask: true,
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'app_release.trigger_scan',
        userId: request.user.userId,
        projectId: release.projectId,
        metadata: { releaseId: id, scanTaskId: scanTask.id },
      },
    });

    return updated;
  });

  fastify.post('/api/app-releases/verify-hash', async (request) => {
    const body = verifyHashSchema.parse(request.body);

    if (body.releaseId) {
      const release = await prisma.appRelease.findUnique({
        where: { id: body.releaseId },
        select: {
          id: true,
          version: true,
          buildNumber: true,
          platform: true,
          preHardeningHash: true,
          postHardeningHash: true,
          status: true,
        },
      });

      if (!release) {
        return { valid: false, reason: 'Release not found' };
      }

      const matchesPre = release.preHardeningHash === body.hash;
      const matchesPost = release.postHardeningHash === body.hash;

      return {
        valid: matchesPre || matchesPost,
        release,
        matches: matchesPre ? 'preHardening' : matchesPost ? 'postHardening' : null,
      };
    }

    if (body.expectedHash) {
      const valid = body.hash === body.expectedHash;
      return { valid, reason: valid ? 'Hash matches' : 'Hash mismatch' };
    }

    return { valid: false, reason: 'No expected hash or releaseId provided' };
  });

  fastify.get('/api/app-releases/hash-chain/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const { limit = '20' } = request.query as { limit?: string };

    const releases = await prisma.appRelease.findMany({
      where: { projectId, status: { not: ReleaseStatus.FAILED } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10), 100),
      select: {
        id: true,
        version: true,
        buildNumber: true,
        platform: true,
        status: true,
        preHardeningHash: true,
        postHardeningHash: true,
        createdAt: true,
        hardenedAt: true,
        publishedAt: true,
      },
    });

    const chainValid = releases.length > 1
      ? releases.every((r, i) => i === 0 || r.preHardeningHash !== releases[i - 1].preHardeningHash)
      : true;

    return {
      projectId,
      releases,
      chainValid,
      chainLength: releases.length,
    };
  });

  fastify.delete('/api/app-releases/:id', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };

    const release = await prisma.appRelease.findUnique({ where: { id } });
    if (!release) {
      return reply.status(404).send({ error: 'Release not found' });
    }

    await prisma.appRelease.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'app_release.delete',
        userId: request.user.userId,
        projectId: release.projectId,
        metadata: { releaseId: id },
      },
    });

    return reply.status(204).send();
  });
};

export default appReleaseRoutes;
