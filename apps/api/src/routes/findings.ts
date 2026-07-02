import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { computeDedupHash } from '../utils/dedup.js';
import { Severity, FindingStatus } from '@prisma/client';
import { getDefectDojoClient, type DDFinding } from '../lib/defectdojo.js';

const findingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  projectId: z.string().optional(),
  scanId: z.string().optional(),
  severity: z.nativeEnum(Severity).optional(),
  status: z.nativeEnum(FindingStatus).optional(),
  assigneeId: z.string().optional(),
  falsePositive: z.coerce.boolean().optional(),
  cwe: z.string().optional(),
  search: z.string().optional(),
  dedupHash: z.string().optional(),
  slaBreached: z.coerce.boolean().optional(),
  sortBy: z.enum(['severity', 'createdAt', 'filePath', 'slaDeadline', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const markFalsePositiveSchema = z.object({
  falsePositive: z.boolean(),
  reason: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(FindingStatus),
  resolutionNote: z.string().optional(),
});

const assignFindingSchema = z.object({
  assigneeId: z.string().nullable(),
});

const batchUpdateSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  status: z.nativeEnum(FindingStatus).optional(),
  assigneeId: z.string().nullable().optional(),
});

function mapDDFindingToLocal(f: DDFinding, project?: { id: string; name: string; productId: string }) {
  return {
    id: String(f.id),
    title: f.title,
    severity: mapSeverity(f.severity),
    cwe: f.cwe ? String(f.cwe) : null,
    cve: f.cve,
    cvss: f.cvssv3_score ?? null,
    description: f.description ?? '',
    location: f.url ?? f.file_path ?? null,
    filePath: f.file_path,
    lineStart: f.line,
    lineEnd: null,
    scanId: String(f.test),
    scan: {
      id: String(f.test),
      type: 'defectdojo',
      status: 'COMPLETED',
      triggeredAt: f.created,
    },
    projectId: String(f.product),
    project: project ?? {
      id: String(f.product),
      name: '',
      productId: '',
    },
    dedupHash: '',
    falsePositive: f.false_p ?? false,
    active: f.active,
    verified: f.verified,
    createdAt: f.created,
    updatedAt: f.updated,
  };
}

function mapSeverity(ddSeverity: string): Severity {
  const s = ddSeverity.toUpperCase();
  if (s === 'CRITICAL') return Severity.CRITICAL;
  if (s === 'HIGH') return Severity.HIGH;
  if (s === 'MEDIUM') return Severity.MEDIUM;
  if (s === 'LOW') return Severity.LOW;
  return Severity.INFO;
}

function mapOrdering(sortBy: string, sortOrder: string): string {
  const orderMap: Record<string, string> = {
    severity: 'numerical_severity',
    createdAt: 'created',
    filePath: 'file_path',
  };
  const field = orderMap[sortBy] || 'created';
  return sortOrder === 'desc' ? `-${field}` : field;
}

const findingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/findings', async (request) => {
    const query = findingQuerySchema.parse(request.query);
    const dd = getDefectDojoClient();

    if (dd.enabled) {
      try {
        let ddProductId: number | undefined;

        if (query.projectId) {
          const project = await prisma.project.findUnique({
            where: { id: query.projectId },
            select: { defectdojoProductId: true, id: true, name: true, productId: true },
          });
          if (project?.defectdojoProductId) {
            ddProductId = project.defectdojoProductId;
          } else if (!isNaN(Number(query.projectId))) {
            ddProductId = Number(query.projectId);
          }
        }

        if (ddProductId) {
          const offset = (query.page - 1) * query.pageSize;
          const ordering = mapOrdering(query.sortBy, query.sortOrder);

          const ddFindings = await dd.listFindings({
            product: ddProductId,
            severity: query.severity ? query.severity.charAt(0).toUpperCase() + query.severity.slice(1).toLowerCase() : undefined,
            false_p: query.falsePositive,
            search: query.search,
            limit: query.pageSize,
            offset,
            ordering,
          });

          let projectCache = new Map<string, { id: string; name: string; productId: string }>();

          const data = ddFindings.results.map((f) => {
            const projId = String(f.product);
            let project = projectCache.get(projId);
            return mapDDFindingToLocal(f, project);
          });

          return {
            data,
            pagination: {
              page: query.page,
              pageSize: query.pageSize,
              total: ddFindings.count,
              totalPages: Math.ceil(ddFindings.count / query.pageSize),
            },
          };
        }
      } catch {
        // fall through to local DB
      }
    }

    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.scanId) where.scanId = query.scanId;
    if (query.severity) where.severity = query.severity;
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.falsePositive !== undefined) where.falsePositive = query.falsePositive;
    if (query.cwe) where.cwe = query.cwe;
    if (query.dedupHash) where.dedupHash = query.dedupHash;
    if (query.slaBreached) {
      where.AND = [
        { slaDeadline: { not: null, lt: new Date() } },
        { status: { notIn: [FindingStatus.RESOLVED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK] } },
      ];
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { filePath: { contains: query.search, mode: 'insensitive' } },
        { cve: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, string> = {};
    if (query.sortBy === 'severity') {
      orderBy.severity = query.sortOrder;
    } else if (query.sortBy === 'createdAt') {
      orderBy.createdAt = query.sortOrder;
    } else if (query.sortBy === 'filePath') {
      orderBy.filePath = query.sortOrder;
    } else if (query.sortBy === 'slaDeadline') {
      orderBy.slaDeadline = query.sortOrder;
    } else if (query.sortBy === 'status') {
      orderBy.status = query.sortOrder;
    }

    const [findings, total] = await Promise.all([
      prisma.finding.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy,
        include: {
          project: {
            select: { id: true, name: true, productId: true },
          },
          scan: {
            select: { id: true, type: true, status: true, triggeredAt: true },
          },
          assignee: {
            select: { id: true, name: true, email: true },
          },
        },
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

  fastify.get('/api/findings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dd = getDefectDojoClient();

    if (dd.enabled && /^\d+$/.test(id)) {
      try {
        const f = await dd.getFinding(Number(id));
        return mapDDFindingToLocal(f);
      } catch {
        // fall through to local DB
      }
    }

    const finding = await prisma.finding.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, productId: true },
        },
        scan: {
          select: {
            id: true,
            type: true,
            status: true,
            triggeredAt: true,
            traceId: true,
          },
        },
      },
    });

    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    return finding;
  });

  fastify.patch('/api/findings/:id/false-positive', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = markFalsePositiveSchema.parse(request.body);
    const dd = getDefectDojoClient();

    if (dd.enabled && /^\d+$/.test(id)) {
      try {
        const updated = await dd.markFalsePositive(Number(id), body.falsePositive);

        const localFinding = await prisma.finding.findFirst({
          where: { id },
        });

        if (localFinding) {
          await prisma.auditLog.create({
            data: {
              action: body.falsePositive ? 'finding.mark_fp' : 'finding.unmark_fp',
              userId: request.user.userId,
              projectId: localFinding.projectId,
              metadata: { findingId: id, reason: body.reason },
            },
          });
        }

        return mapDDFindingToLocal(updated);
      } catch (err) {
        console.error('Failed to update DefectDojo finding:', err);
      }
    }

    const finding = await prisma.finding.findUnique({ where: { id } });
    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    const updated = await prisma.finding.update({
      where: { id },
      data: { falsePositive: body.falsePositive },
    });

    await prisma.auditLog.create({
      data: {
        action: body.falsePositive ? 'finding.mark_fp' : 'finding.unmark_fp',
        userId: request.user.userId,
        projectId: finding.projectId,
        metadata: {
          findingId: id,
          reason: body.reason,
        },
      },
    });

    return updated;
  });

  fastify.get('/api/findings/dedup/:hash', async (request) => {
    const { hash } = request.params as { hash: string };

    const findings = await prisma.finding.findMany({
      where: { dedupHash: hash },
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, productId: true },
        },
        scan: {
          select: { id: true, type: true, triggeredAt: true },
        },
      },
    });

    const uniqueProjects = [...new Set(findings.map((f) => f.projectId))].length;
    const uniqueScans = [...new Set(findings.map((f) => f.scanId))].length;

    return {
      dedupHash: hash,
      totalOccurrences: findings.length,
      uniqueProjects,
      uniqueScans,
      findings,
    };
  });

  fastify.post('/api/findings/dedup/compute', async (request) => {
    const body = z.object({
      cwe: z.string().optional(),
      filePath: z.string().optional(),
      lineStart: z.number().int().optional(),
      location: z.string().optional(),
      title: z.string().optional(),
      params: z.record(z.string()).optional(),
    }).parse(request.body);

    const hash = computeDedupHash(body);

    const existingFindings = await prisma.finding.count({
      where: { dedupHash: hash, falsePositive: false },
    });

    return {
      dedupHash: hash,
      existingFindings,
      isDuplicate: existingFindings > 0,
    };
  });

  fastify.get('/api/findings/stats/summary', async (request) => {
    const query = z.object({
      projectId: z.string().optional(),
    }).parse(request.query);
    const dd = getDefectDojoClient();

    if (dd.enabled) {
      let ddProductId: number | undefined;

      if (query.projectId) {
        const project = await prisma.project.findUnique({
          where: { id: query.projectId },
          select: { defectdojoProductId: true },
        });
        if (project?.defectdojoProductId) {
          ddProductId = project.defectdojoProductId;
        } else if (!isNaN(Number(query.projectId))) {
          ddProductId = Number(query.projectId);
        }
      }

      const severities = ['Critical', 'High', 'Medium', 'Low', 'Info'];
      const severityDistribution: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0,
      };

      let total = 0;

      await Promise.all(
        severities.map(async (sev) => {
          try {
            const result = await dd.listFindings({
              product: ddProductId,
              severity: sev,
              false_p: false,
              active: true,
              limit: 1,
            });
            const count = result.count;
            severityDistribution[sev.toUpperCase()] = count;
            total += count;
          } catch {
            // ignore
          }
        })
      );

      return {
        total,
        severityDistribution,
        topCwes: [] as Array<{ cwe: string | null; count: number }>,
        topFiles: [] as Array<{ filePath: string | null; count: number }>,
      };
    }

    const where: Record<string, unknown> = { falsePositive: false };
    if (query.projectId) where.projectId = query.projectId;

    const [bySeverity, total, byCwe, byFilePath] = await Promise.all([
      prisma.finding.groupBy({
        by: ['severity'],
        where,
        _count: { severity: true },
      }),
      prisma.finding.count({ where }),
      prisma.finding.groupBy({
        by: ['cwe'],
        where: { ...where, cwe: { not: null } },
        _count: { cwe: true },
        orderBy: { _count: { cwe: 'desc' } },
        take: 10,
      }),
      prisma.finding.groupBy({
        by: ['filePath'],
        where: { ...where, filePath: { not: null } },
        _count: { filePath: true },
        orderBy: { _count: { filePath: 'desc' } },
        take: 10,
      }),
    ]);

    const severityDistribution: Record<string, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };

    for (const item of bySeverity) {
      severityDistribution[item.severity] = item._count.severity;
    }

    return {
      total,
      severityDistribution,
      topCwes: byCwe.map((item) => ({ cwe: item.cwe, count: item._count.cwe })),
      topFiles: byFilePath.map((item) => ({ filePath: item.filePath, count: item._count.filePath })),
    };
  });
  fastify.patch('/api/findings/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateStatusSchema.parse(request.body);

    const finding = await prisma.finding.findUnique({ where: { id } });
    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    const data: Record<string, unknown> = { status: body.status };
    if (body.resolutionNote) data.resolutionNote = body.resolutionNote;
    if (body.status === FindingStatus.RESOLVED) data.resolvedAt = new Date();

    const updated = await prisma.finding.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        action: 'finding.status_update',
        userId: request.user.userId,
        projectId: finding.projectId,
        metadata: { findingId: id, fromStatus: finding.status, toStatus: body.status, note: body.resolutionNote },
      },
    });

    return updated;
  });

  fastify.patch('/api/findings/:id/assign', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = assignFindingSchema.parse(request.body);

    const finding = await prisma.finding.findUnique({ where: { id } });
    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    const updated = await prisma.finding.update({
      where: { id },
      data: { assigneeId: body.assigneeId },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'finding.assign',
        userId: request.user.userId,
        projectId: finding.projectId,
        metadata: { findingId: id, assigneeId: body.assigneeId },
      },
    });

    return updated;
  });

  fastify.post('/api/findings/batch-update', async (request) => {
    const body = batchUpdateSchema.parse(request.body);

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    if (body.status === FindingStatus.RESOLVED) data.resolvedAt = new Date();

    const result = await prisma.finding.updateMany({
      where: { id: { in: body.ids } },
      data,
    });

    const sampleFinding = await prisma.finding.findFirst({
      where: { id: { in: body.ids } },
      select: { projectId: true },
    });

    await prisma.auditLog.create({
      data: {
        action: 'finding.batch_update',
        userId: request.user.userId,
        projectId: sampleFinding?.projectId,
        metadata: { ids: body.ids, status: body.status, assigneeId: body.assigneeId, count: result.count },
      },
    });

    return { updated: result.count };
  });

  fastify.patch('/api/findings/:id/sla', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      slaDeadline: z.coerce.date().nullable(),
    }).parse(request.body);

    const finding = await prisma.finding.findUnique({ where: { id } });
    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    return prisma.finding.update({
      where: { id },
      data: { slaDeadline: body.slaDeadline },
    });
  });

  fastify.get('/api/findings/stats/by-status', async (request) => {
    const query = z.object({
      projectId: z.string().optional(),
    }).parse(request.query);

    const where: Record<string, unknown> = { falsePositive: false };
    if (query.projectId) where.projectId = query.projectId;

    const byStatus = await prisma.finding.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const result: Record<string, number> = {};
    for (const s of Object.values(FindingStatus)) {
      result[s] = 0;
    }
    for (const item of byStatus) {
      result[item.status] = item._count.status;
    }

    return result;
  });

  fastify.get('/api/findings/stats/sla', async (request) => {
    const query = z.object({
      projectId: z.string().optional(),
    }).parse(request.query);

    const where: Record<string, unknown> = {
      falsePositive: false,
      status: { notIn: [FindingStatus.RESOLVED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK] },
    };
    if (query.projectId) where.projectId = query.projectId;

    const [total, breached, atRisk] = await Promise.all([
      prisma.finding.count({ where: { ...where, slaDeadline: { not: null } } }),
      prisma.finding.count({
        where: { ...where, slaDeadline: { not: null, lt: new Date() } },
      }),
      prisma.finding.count({
        where: {
          ...where,
          slaDeadline: {
            not: null,
            gte: new Date(),
            lt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return { total, breached, atRisk };
  });
};

export default findingsRoutes;
