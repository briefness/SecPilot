import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { computeDedupHash, dedupeLatest } from '../utils/dedup.js';
import { Severity, FindingStatus, Prisma } from '@prisma/client';
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

const VALID_STATUS_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  [FindingStatus.NEW]: [FindingStatus.CONFIRMED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK],
  [FindingStatus.CONFIRMED]: [FindingStatus.IN_PROGRESS, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK],
  [FindingStatus.IN_PROGRESS]: [FindingStatus.MITIGATED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK],
  [FindingStatus.MITIGATED]: [FindingStatus.RESOLVED],
  [FindingStatus.RESOLVED]: [],
  [FindingStatus.FALSE_POSITIVE]: [FindingStatus.NEW],
  [FindingStatus.ACCEPTED_RISK]: [FindingStatus.NEW],
};

function isValidTransition(from: FindingStatus, to: FindingStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

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

    const where: Prisma.FindingWhereInput = {};
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

    const allFindings = await prisma.finding.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, productId: true } },
        scan: { select: { id: true, type: true, status: true, triggeredAt: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    const deduped = dedupeLatest(allFindings);

    const severityOrder: Record<string, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 1,
      [Severity.MEDIUM]: 2,
      [Severity.LOW]: 3,
      [Severity.INFO]: 4,
    };

    deduped.sort((a, b) => {
      let cmp = 0;
      if (query.sortBy === 'severity') {
        cmp = severityOrder[a.severity] - severityOrder[b.severity];
      } else if (query.sortBy === 'createdAt') {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      } else if (query.sortBy === 'filePath') {
        cmp = (a.filePath || '').localeCompare(b.filePath || '');
      } else if (query.sortBy === 'slaDeadline') {
        cmp = (a.slaDeadline?.getTime() || 0) - (b.slaDeadline?.getTime() || 0);
      } else if (query.sortBy === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return query.sortOrder === 'desc' ? -cmp : cmp;
    });

    const total = deduped.length;
    const skip = (query.page - 1) * query.pageSize;
    const findings = deduped.slice(skip, skip + query.pageSize);

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

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({
        where: { id },
        data: { falsePositive: body.falsePositive },
      });

      await tx.auditLog.create({
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

      return result;
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

    const where: Prisma.FindingWhereInput = { falsePositive: false };
    if (query.projectId) where.projectId = query.projectId;

    const allFindings = await prisma.finding.findMany({
      where,
      select: { id: true, dedupHash: true, createdAt: true, severity: true, cwe: true, filePath: true },
    });

    const deduped = dedupeLatest(allFindings);

    const severityDistribution: Record<string, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };

    const cweCounts = new Map<string | null, number>();
    const fileCounts = new Map<string | null, number>();

    for (const f of deduped) {
      severityDistribution[f.severity]++;
      if (f.cwe) cweCounts.set(f.cwe, (cweCounts.get(f.cwe) || 0) + 1);
      if (f.filePath) fileCounts.set(f.filePath, (fileCounts.get(f.filePath) || 0) + 1);
    }

    const topCwes = Array.from(cweCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cwe, count]) => ({ cwe, count }));

    const topFiles = Array.from(fileCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([filePath, count]) => ({ filePath, count }));

    return {
      total: deduped.length,
      severityDistribution,
      topCwes,
      topFiles,
    };
  });
  fastify.patch('/api/findings/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateStatusSchema.parse(request.body);

    const finding = await prisma.finding.findUnique({ where: { id } });
    if (!finding) {
      return reply.status(404).send({ error: 'Finding not found' });
    }

    if (finding.status !== body.status && !isValidTransition(finding.status, body.status)) {
      return reply.status(400).send({
        error: `Invalid status transition from ${finding.status} to ${body.status}`,
        allowedTransitions: VALID_STATUS_TRANSITIONS[finding.status] || [],
      });
    }

    const data: Record<string, unknown> = { status: body.status };
    if (body.resolutionNote) data.resolutionNote = body.resolutionNote;
    if (body.status === FindingStatus.RESOLVED) data.resolvedAt = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({ where: { id }, data });

      await tx.auditLog.create({
        data: {
          action: 'finding.status_update',
          userId: request.user.userId,
          projectId: finding.projectId,
          metadata: { findingId: id, fromStatus: finding.status, toStatus: body.status, note: body.resolutionNote },
        },
      });

      return result;
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

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({
        where: { id },
        data: { assigneeId: body.assigneeId },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'finding.assign',
          userId: request.user.userId,
          projectId: finding.projectId,
          metadata: { findingId: id, assigneeId: body.assigneeId },
        },
      });

      return result;
    });

    return updated;
  });

  fastify.post('/api/findings/batch-update', async (request) => {
    const body = batchUpdateSchema.parse(request.body);

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    if (body.status === FindingStatus.RESOLVED) data.resolvedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.finding.updateMany({
        where: { id: { in: body.ids } },
        data,
      });

      const sampleFinding = await tx.finding.findFirst({
        where: { id: { in: body.ids } },
        select: { projectId: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'finding.batch_update',
          userId: request.user.userId,
          projectId: sampleFinding?.projectId,
          metadata: { ids: body.ids, status: body.status, assigneeId: body.assigneeId, count: updateResult.count },
        },
      });

      return updateResult;
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

    const where: Prisma.FindingWhereInput = { falsePositive: false };
    if (query.projectId) where.projectId = query.projectId;

    const allFindings = await prisma.finding.findMany({
      where,
      select: { id: true, dedupHash: true, createdAt: true, status: true },
    });

    const deduped = dedupeLatest(allFindings);

    const result: Record<string, number> = {};
    for (const s of Object.values(FindingStatus)) {
      result[s] = 0;
    }
    for (const f of deduped) {
      result[f.status]++;
    }

    return result;
  });

  fastify.get('/api/findings/stats/sla', async (request) => {
    const query = z.object({
      projectId: z.string().optional(),
    }).parse(request.query);

    const where: Prisma.FindingWhereInput = {
      falsePositive: false,
      status: { notIn: [FindingStatus.RESOLVED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK] },
    };
    if (query.projectId) where.projectId = query.projectId;

    const allFindings = await prisma.finding.findMany({
      where,
      select: { id: true, dedupHash: true, createdAt: true, slaDeadline: true },
    });

    const deduped = dedupeLatest(allFindings);

    const now = new Date();
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    let total = 0;
    let breached = 0;
    let atRisk = 0;

    for (const f of deduped) {
      if (!f.slaDeadline) continue;
      total++;
      if (f.slaDeadline < now) breached++;
      else if (f.slaDeadline < threeDaysLater) atRisk++;
    }

    return { total, breached, atRisk };
  });
};

export default findingsRoutes;
