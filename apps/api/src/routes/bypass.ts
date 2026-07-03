import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { notificationService } from '../lib/notification.js';
import { BypassSeverity, BypassStatus, UserRole } from '@prisma/client';
import { hashToken } from '../lib/encryption.js';

function generateBypassToken(): string {
  return 'sbp_' + randomBytes(24).toString('hex');
}

const createBypassSchema = z.object({
  projectId: z.string(),
  reason: z.string().min(10).max(1000),
  expiresAt: z.coerce.date(),
});

const approveBypassSchema = z.object({
  status: z.enum([BypassStatus.APPROVED, BypassStatus.REJECTED]),
  comment: z.string().optional(),
});

const bypassQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().optional(),
  status: z.nativeEnum(BypassStatus).optional(),
  requestedBy: z.string().optional(),
});

const bypassRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/bypass', async (request) => {
    const query = bypassQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.requestedBy) where.requestedBy = query.requestedBy;

    const [bypassRequests, total] = await Promise.all([
      prisma.bypassRequest.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: { id: true, name: true, productId: true },
          },
          requester: {
            select: { id: true, name: true, email: true },
          },
          approver: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.bypassRequest.count({ where }),
    ]);

    return {
      data: bypassRequests,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/bypass/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const bypass = await prisma.bypassRequest.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, productId: true, type: true },
        },
        requester: {
          select: { id: true, name: true, email: true, role: true },
        },
        approver: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!bypass) {
      return reply.status(404).send({ error: 'Bypass request not found' });
    }

    return bypass;
  });

  fastify.post('/api/bypass', async (request, reply) => {
    const body = createBypassSchema.parse(request.body);

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    if (body.expiresAt <= new Date()) {
      return reply.status(400).send({ error: 'Expiry date must be in the future' });
    }

    const bypass = await prisma.$transaction(async (tx) => {
      const b = await tx.bypassRequest.create({
        data: {
          projectId: body.projectId,
          reason: body.reason,
          requestedBy: request.user.userId,
          expiresAt: body.expiresAt,
          status: BypassStatus.PENDING,
        },
      });

      const auditLog = await tx.auditLog.create({
        data: {
          action: 'bypass.request',
          userId: request.user.userId,
          projectId: body.projectId,
          metadata: {
            bypassId: b.id,
            reason: body.reason,
            expiresAt: body.expiresAt,
          },
        },
      });

      return tx.bypassRequest.update({
        where: { id: b.id },
        data: { auditLogId: auditLog.id },
      });
    });

    return reply.status(201).send(bypass);
  });

  fastify.post('/api/bypass/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = approveBypassSchema.parse(request.body);

    const bypass = await prisma.bypassRequest.findUnique({ where: { id } });
    if (!bypass) {
      return reply.status(404).send({ error: 'Bypass request not found' });
    }

    if (bypass.status !== BypassStatus.PENDING) {
      return reply.status(400).send({ error: 'Bypass request is not pending' });
    }

    const isAdmin = request.user.role === UserRole.ADMIN || request.user.role === UserRole.AUDITOR;
    if (!isAdmin) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const bypassToken = body.status === BypassStatus.APPROVED ? generateBypassToken() : null;

    let updated: typeof bypass | null = null;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.bypassRequest.updateMany({
          where: { id, status: BypassStatus.PENDING },
          data: {
            status: body.status,
            approvedBy: request.user.userId,
            approvedAt: new Date(),
            tokenHash: bypassToken ? hashToken(bypassToken) : null,
          },
        });

        if (updateResult.count === 0) {
          const latest = await tx.bypassRequest.findUnique({ where: { id } });
          throw Object.assign(new Error('Bypass status changed'), { statusCode: 409, currentStatus: latest?.status });
        }

        await tx.auditLog.create({
          data: {
            action: body.status === BypassStatus.APPROVED ? 'bypass.approve' : 'bypass.reject',
            userId: request.user.userId,
            projectId: bypass.projectId,
            metadata: {
              bypassId: id,
              comment: body.comment,
            },
          },
        });

        return tx.bypassRequest.findUnique({ where: { id } });
      });
    } catch (err: any) {
      if (err?.statusCode === 409) {
        return reply.status(409).send({ error: 'Bypass status changed', currentStatus: err.currentStatus });
      }
      throw err;
    }

    if (!updated) return reply.status(404).send({ error: 'Bypass request not found' });

    if (body.status === BypassStatus.APPROVED) {
      notificationService.sendAll({
        title: `[安全告警] 安全门禁 Bypass 已审批通过`,
        body: `${request.user.name} 审批通过了项目 \`${bypass.projectId}\` 的 Bypass 请求，原因：${bypass.reason.substring(0, 100)}`,
        severity: bypass.severity === BypassSeverity.CRITICAL ? 'critical' : 'warning',
        fields: {
          'Bypass ID': id,
          '严重程度': bypass.severity,
          '过期时间': new Date(bypass.expiresAt).toLocaleString(),
          '审批人': request.user.name ?? 'System',
        },
      }).catch((err) => console.warn('[Bypass] Notification send failed:', err));

      return {
        ...updated,
        token: bypassToken,
      };
    }

    return updated;
  });

  fastify.get('/api/bypass/project/:projectId/active', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const activeBypasses = await prisma.bypassRequest.findMany({
      where: {
        projectId,
        status: BypassStatus.APPROVED,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
      include: {
        requester: {
          select: { id: true, name: true, email: true },
        },
        approver: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return {
      active: activeBypasses.length > 0,
      count: activeBypasses.length,
      bypasses: activeBypasses,
    };
  });

  fastify.get('/api/bypass/stats/summary', async () => {
    const [total, pending, approved, rejected, expired] = await Promise.all([
      prisma.bypassRequest.count(),
      prisma.bypassRequest.count({ where: { status: BypassStatus.PENDING } }),
      prisma.bypassRequest.count({ where: { status: BypassStatus.APPROVED } }),
      prisma.bypassRequest.count({ where: { status: BypassStatus.REJECTED } }),
      prisma.bypassRequest.count({
        where: {
          status: BypassStatus.APPROVED,
          expiresAt: { lt: new Date() },
        },
      }),
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
      expired,
    };
  });
};

export default bypassRoutes;
