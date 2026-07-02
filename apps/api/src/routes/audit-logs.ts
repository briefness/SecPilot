import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  userId: z.string().optional(),
  projectId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const auditLogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/audit-logs', async (request) => {
    const query = auditLogQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (query.projectId) where.projectId = query.projectId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Record<string, Date>).gte = query.from;
      if (query.to) (where.createdAt as Record<string, Date>).lte = query.to;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, email: true },
          },
          project: {
            select: { name: true, productId: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/audit-logs/actions', async () => {
    const actions = await prisma.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
      orderBy: { _count: { action: 'desc' } },
      take: 20,
    });

    return actions.map((a) => ({
      action: a.action,
      count: a._count.action,
    }));
  });

  fastify.get('/api/audit-logs/stats/summary', async () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, todayCount, weekCount, byAction] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      total,
      today: todayCount,
      last7Days: weekCount,
      byAction: byAction.map((a) => ({
        action: a.action,
        count: a._count.action,
      })),
    };
  });
};

export default auditLogRoutes;
