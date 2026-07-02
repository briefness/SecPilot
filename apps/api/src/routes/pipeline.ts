import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { PipelineStage, ScanStatus, ScanType } from '@prisma/client';

const pipelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().optional(),
  stage: z.nativeEnum(PipelineStage).optional(),
  status: z.nativeEnum(ScanStatus).optional(),
});

const stageStatsSchema = z.object({
  projectId: z.string().optional(),
});

const pipelineRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/pipeline/executions', async (request) => {
    const query = pipelineQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {
      pipelineStage: { not: null },
    };
    if (query.projectId) where.projectId = query.projectId;
    if (query.stage) where.pipelineStage = query.stage;
    if (query.status) where.status = query.status;

    const [executions, total] = await Promise.all([
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
      data: executions,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/pipeline/stats/summary', async (request) => {
    const query = stageStatsSchema.parse(request.query);

    const baseWhere: Record<string, unknown> = {
      pipelineStage: { not: null },
    };
    if (query.projectId) baseWhere.projectId = query.projectId;

    const [total, running, completed, failed, todayCount] = await Promise.all([
      prisma.scanTask.count({ where: baseWhere }),
      prisma.scanTask.count({ where: { ...baseWhere, status: ScanStatus.RUNNING } }),
      prisma.scanTask.count({ where: { ...baseWhere, status: ScanStatus.COMPLETED } }),
      prisma.scanTask.count({ where: { ...baseWhere, status: ScanStatus.FAILED } }),
      prisma.scanTask.count({
        where: {
          ...baseWhere,
          triggeredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const stages = Object.values(PipelineStage);
    const stageCounts = await Promise.all(
      stages.map(async (stage) => {
        const count = await prisma.scanTask.count({
          where: { ...baseWhere, pipelineStage: stage },
        });
        return { stage, count };
      })
    );

    const scanTypeCounts = await Promise.all(
      Object.values(ScanType).map(async (type) => {
        const count = await prisma.scanTask.count({
          where: { ...baseWhere, type },
        });
        return { type, count };
      })
    );

    return {
      total,
      running,
      completed,
      failed,
      todayCount,
      stageDistribution: stageCounts,
      scanTypeDistribution: scanTypeCounts,
    };
  });
};

export default pipelineRoutes;
