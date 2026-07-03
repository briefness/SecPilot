import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Severity, ScanType } from '@prisma/client';

const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  projectId: z.string().optional(),
});

function buildDateRangeConditions(from?: Date, to?: Date, projectId?: string): { sql: string; params: unknown[] } {
  const conditions: string[] = ['"falsePositive" = false'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (projectId) {
    conditions.push(`"projectId" = $${paramIdx}`);
    params.push(projectId);
    paramIdx++;
  }
  if (from) {
    conditions.push(`"createdAt" >= $${paramIdx}`);
    params.push(from);
    paramIdx++;
  }
  if (to) {
    conditions.push(`"createdAt" <= $${paramIdx}`);
    params.push(to);
    paramIdx++;
  }

  return { sql: conditions.join(' AND '), params };
}

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/reports/vulnerability-trend', async (request) => {
    const query = reportQuerySchema.parse(request.query);

    const now = query.to || new Date();
    const thirtyDaysAgo = query.from || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { sql, params } = buildDateRangeConditions(thirtyDaysAgo, now, query.projectId);

    const result = await prisma.$queryRawUnsafe<{ date: string; severity: string; count: bigint }[]>(`
      SELECT
        DATE("createdAt")::text as date,
        severity,
        COUNT(*)::bigint as count
      FROM (
        SELECT DISTINCT ON ("dedupHash") "createdAt", severity
        FROM "Finding"
        WHERE ${sql}
        ORDER BY "dedupHash", "createdAt" DESC
      ) latest
      GROUP BY DATE("createdAt"), severity
      ORDER BY date
    `, ...params);

    const days: Record<string, Record<Severity, number>> = {};
    const start = new Date(thirtyDaysAgo);
    while (start <= now) {
      const dateStr = start.toISOString().split('T')[0];
      days[dateStr] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
      start.setDate(start.getDate() + 1);
    }

    for (const row of result) {
      const sev = row.severity as Severity;
      if (days[row.date] && sev in days[row.date]) {
        days[row.date][sev] = Number(row.count);
      }
    }

    const trend = Object.entries(days).map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW + counts.INFO,
    }));

    return { trend, total: trend.reduce((s, d) => s + d.total, 0) };
  });

  fastify.get('/api/reports/severity-distribution', async (request) => {
    const query = reportQuerySchema.parse(request.query);
    const { sql, params } = buildDateRangeConditions(query.from, query.to, query.projectId);

    const result = await prisma.$queryRawUnsafe<{ severity: string; count: bigint }[]>(`
      SELECT severity, COUNT(*)::bigint as count
      FROM (
        SELECT DISTINCT ON ("dedupHash") severity
        FROM "Finding"
        WHERE ${sql}
        ORDER BY "dedupHash", "createdAt" DESC
      ) latest
      GROUP BY severity
    `, ...params);

    const bySeverity: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    let total = 0;
    for (const row of result) {
      const sev = row.severity as Severity;
      if (sev in bySeverity) {
        bySeverity[sev] = Number(row.count);
        total += Number(row.count);
      }
    }

    return { bySeverity, total };
  });

  fastify.get('/api/reports/project-compliance', async () => {
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: { scanTasks: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const findingsByProject = await prisma.$queryRawUnsafe<{ projectId: string; severity: string; count: bigint }[]>(`
      SELECT "projectId", severity, COUNT(*)::bigint as count
      FROM (
        SELECT DISTINCT ON ("dedupHash") "projectId", severity
        FROM "Finding"
        WHERE "falsePositive" = false
        ORDER BY "dedupHash", "createdAt" DESC
      ) latest
      GROUP BY "projectId", severity
    `);

    const projectStats = new Map<string, Record<Severity, number>>();
    for (const row of findingsByProject) {
      if (!projectStats.has(row.projectId)) {
        projectStats.set(row.projectId, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 });
      }
      const sev = row.severity as Severity;
      const stats = projectStats.get(row.projectId)!;
      if (sev in stats) stats[sev] = Number(row.count);
    }

    const compliance = projects.map((p) => {
      const findingsCount = projectStats.get(p.id) || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
      const totalFindings = findingsCount.CRITICAL + findingsCount.HIGH + findingsCount.MEDIUM + findingsCount.LOW + findingsCount.INFO;

      let status: 'compliant' | 'warning' | 'critical' | 'unknown';
      if (p._count.scanTasks === 0) {
        status = 'unknown';
      } else if (findingsCount.CRITICAL > 0) {
        status = 'critical';
      } else if (findingsCount.HIGH > 0) {
        status = 'warning';
      } else {
        status = 'compliant';
      }

      return {
        id: p.id,
        name: p.name,
        productId: p.productId,
        type: p.type,
        status,
        findingsCount: { CRITICAL: findingsCount.CRITICAL, HIGH: findingsCount.HIGH, MEDIUM: findingsCount.MEDIUM, LOW: findingsCount.LOW },
        totalFindings,
        totalScans: p._count.scanTasks,
        lastScanAt: p.lastScanAt,
      };
    });

    const compliant = compliance.filter((p) => p.status === 'compliant').length;
    const warning = compliance.filter((p) => p.status === 'warning').length;
    const critical = compliance.filter((p) => p.status === 'critical').length;
    const unknown = compliance.filter((p) => p.status === 'unknown').length;

    return {
      projects: compliance,
      summary: {
        total: projects.length,
        compliant,
        warning,
        critical,
        unknown,
        complianceRate: projects.length > 0 ? Math.round((compliant / projects.length) * 100) : 0,
      },
    };
  });

  fastify.get('/api/reports/scan-summary', async (request) => {
    const query = reportQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.from || query.to) {
      where.triggeredAt = {};
      if (query.from) (where.triggeredAt as Record<string, Date>).gte = query.from;
      if (query.to) (where.triggeredAt as Record<string, Date>).lte = query.to;
    }

    const scanTypes = [ScanType.STATIC_SAST, ScanType.STATIC_SCA, ScanType.DYNAMIC_DAST, ScanType.DYNAMIC_PLAYWRIGHT, ScanType.MOBILE_MOBSF, ScanType.API_NUCLEI];

    const byType = await Promise.all(
      scanTypes.map(async (type) => {
        const count = await prisma.scanTask.count({ where: { ...where, type } });
        return { type, count };
      })
    );

    const [total, completed, failed, running, pending] = await Promise.all([
      prisma.scanTask.count({ where }),
      prisma.scanTask.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.scanTask.count({ where: { ...where, status: 'FAILED' } }),
      prisma.scanTask.count({ where: { ...where, status: 'RUNNING' } }),
      prisma.scanTask.count({ where: { ...where, status: 'PENDING' } }),
    ]);

    return {
      total,
      byStatus: { completed, failed, running, pending },
      byType,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  fastify.get('/api/reports/top-vulnerable-projects', async () => {
    const result = await prisma.$queryRawUnsafe<{ projectId: string; projectName: string; productId: string; severity: string; count: bigint }[]>(`
      SELECT p.id as "projectId", p.name as "projectName", p."productId", f.severity, COUNT(*)::bigint as count
      FROM (
        SELECT DISTINCT ON ("dedupHash") "projectId", severity
        FROM "Finding"
        WHERE "falsePositive" = false
        ORDER BY "dedupHash", "createdAt" DESC
      ) f
      JOIN "Project" p ON p.id = f."projectId"
      GROUP BY p.id, p.name, p."productId", f.severity
    `);

    const projectMap = new Map<string, { id: string; name: string; productId: string; critical: number; high: number; medium: number; total: number }>();

    for (const row of result) {
      if (!projectMap.has(row.projectId)) {
        projectMap.set(row.projectId, {
          id: row.projectId,
          name: row.projectName,
          productId: row.productId,
          critical: 0,
          high: 0,
          medium: 0,
          total: 0,
        });
      }
      const p = projectMap.get(row.projectId)!;
      const cnt = Number(row.count);
      if (row.severity === Severity.CRITICAL) p.critical = cnt;
      else if (row.severity === Severity.HIGH) p.high = cnt;
      else if (row.severity === Severity.MEDIUM) p.medium = cnt;
      p.total += cnt;
    }

    const ranked = Array.from(projectMap.values())
      .map((p) => ({
        ...p,
        riskScore: p.critical * 10 + p.high * 5 + p.medium * 2,
      }))
      .filter((p) => p.total > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    return { projects: ranked };
  });
};

export default reportsRoutes;
