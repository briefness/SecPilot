import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getQueueStats } from '../lib/queue.js';
import { getDefectDojoClient } from '../lib/defectdojo.js';
import { Severity, ScanType, ScanStatus } from '@prisma/client';
import type { DashboardStats } from '@secops/shared-types';

const DD_SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'];

function mapSeverityKey(ddSeverity: string): Severity {
  const s = ddSeverity.toUpperCase();
  if (s === 'CRITICAL') return Severity.CRITICAL;
  if (s === 'HIGH') return Severity.HIGH;
  if (s === 'MEDIUM') return Severity.MEDIUM;
  if (s === 'LOW') return Severity.LOW;
  return Severity.INFO;
}

async function getDDSeverityDistribution(
  dd: ReturnType<typeof getDefectDojoClient>,
  productId?: number
): Promise<{ distribution: Record<Severity, number>; total: number }> {
  const distribution: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.HIGH]: 0,
    [Severity.MEDIUM]: 0,
    [Severity.LOW]: 0,
    [Severity.INFO]: 0,
  };

  let total = 0;

  await Promise.all(
    DD_SEVERITIES.map(async (sev) => {
      try {
        const result = await dd.listFindings({
          product: productId,
          severity: sev,
          false_p: false,
          active: true,
          limit: 1,
        });
        const key = mapSeverityKey(sev);
        distribution[key] = result.count;
        total += result.count;
      } catch {
        // ignore
      }
    })
  );

  return { distribution, total };
}

function dedupeFindingsLatest<T extends { id: string; dedupHash: string; createdAt: Date }>(findings: T[]): T[] {
  const latestMap = new Map<string, T>();
  const sorted = [...findings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const f of sorted) {
    if (!latestMap.has(f.dedupHash)) {
      latestMap.set(f.dedupHash, f);
    }
  }
  return Array.from(latestMap.values());
}

async function getLocalSeverityStats(projectId?: string): Promise<{ distribution: Record<Severity, number>; total: number }> {
  const distribution: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.HIGH]: 0,
    [Severity.MEDIUM]: 0,
    [Severity.LOW]: 0,
    [Severity.INFO]: 0,
  };

  const where: Record<string, unknown> = { falsePositive: false };
  if (projectId) where.projectId = projectId;

  const allFindings = await prisma.finding.findMany({
    where,
    select: { id: true, dedupHash: true, createdAt: true, severity: true },
  });

  const deduped = dedupeFindingsLatest(allFindings);

  let total = 0;
  for (const f of deduped) {
    distribution[f.severity]++;
    total++;
  }

  return { distribution, total };
}

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/dashboard/overview', async (): Promise<DashboardStats> => {
    const dd = getDefectDojoClient();

    const [
      totalProjects,
      runningScans,
      scansToday,
      queueStats,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.scanTask.count({
        where: { status: ScanStatus.RUNNING },
      }),
      prisma.scanTask.count({
        where: {
          triggeredAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      getQueueStats().catch(() => ({ scan: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }, defectDojo: { waiting: 0, active: 0, completed: 0, failed: 0 } })),
    ]);

    let severityDistribution: Record<string, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };
    let totalFindings = 0;

    if (dd.enabled) {
      try {
        const result = await getDDSeverityDistribution(dd);
        if (result.total > 0) {
          severityDistribution = result.distribution as Record<string, number>;
          totalFindings = result.total;
        } else {
          const local = await getLocalSeverityStats();
          severityDistribution = local.distribution as Record<string, number>;
          totalFindings = local.total;
        }
      } catch {
        const local = await getLocalSeverityStats();
        severityDistribution = local.distribution as Record<string, number>;
        totalFindings = local.total;
      }
    } else {
      const local = await getLocalSeverityStats();
      severityDistribution = local.distribution as Record<string, number>;
      totalFindings = local.total;
    }

    const [scanTypeResult, topProjectsResult] = await Promise.all([
      prisma.scanTask.groupBy({
        by: ['type'],
        where: {
          triggeredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _count: { type: true },
      }),
      dd.enabled
        ? prisma.project.findMany({
            where: { defectdojoProductId: { not: null } },
            select: { id: true, name: true, defectdojoProductId: true },
            take: 10,
          }).then(async (projects) => {
            const withCounts = await Promise.all(
              projects.map(async (p) => {
                if (!p.defectdojoProductId) return { projectId: p.id, projectName: p.name, count: 0 };
                try {
                  const r = await dd.listFindings({
                    product: p.defectdojoProductId,
                    false_p: false,
                    active: true,
                    limit: 1,
                  });
                  return { projectId: p.id, projectName: p.name, count: r.count };
                } catch {
                  return { projectId: p.id, projectName: p.name, count: 0 };
                }
              })
            );
            return withCounts.sort((a, b) => b.count - a.count).slice(0, 10);
          })
        : (async () => {
            const allFindings = await prisma.finding.findMany({
              where: { falsePositive: false },
              select: { id: true, dedupHash: true, createdAt: true, projectId: true, project: { select: { name: true } } },
            });
            const deduped = dedupeFindingsLatest(allFindings);
            const projectCounts = new Map<string, { projectId: string; projectName: string; count: number }>();
            for (const f of deduped) {
              const existing = projectCounts.get(f.projectId);
              if (existing) {
                existing.count++;
              } else {
                projectCounts.set(f.projectId, { projectId: f.projectId, projectName: f.project.name, count: 1 });
              }
            }
            return Array.from(projectCounts.values())
              .sort((a, b) => b.count - a.count)
              .slice(0, 10);
          })(),
    ]);

    const scanTypeDistribution: Record<string, number> = {
      [ScanType.STATIC_SAST]: 0,
      [ScanType.STATIC_SCA]: 0,
      [ScanType.DYNAMIC_DAST]: 0,
      [ScanType.DYNAMIC_PLAYWRIGHT]: 0,
      [ScanType.MOBILE_MOBSF]: 0,
      [ScanType.API_NUCLEI]: 0,
    };

    for (const item of scanTypeResult) {
      scanTypeDistribution[item.type] = item._count.type;
    }

    const findingsTrend: Array<{ date: string; count: number }> = [];

    if (!dd.enabled) {
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      const allFindings = await prisma.finding.findMany({
        where: { falsePositive: false, createdAt: { gte: last30Days } },
        select: { id: true, dedupHash: true, createdAt: true },
      });

      const deduped = dedupeFindingsLatest(allFindings);

      const dailyCounts = new Map<string, number>();
      for (const f of deduped) {
        const dateStr = f.createdAt.toISOString().split('T')[0];
        dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + 1);
      }

      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        findingsTrend.push({
          date: dateStr,
          count: dailyCounts.get(dateStr) || 0,
        });
      }
    } else {
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        findingsTrend.push({
          date: d.toISOString().split('T')[0],
          count: 0,
        });
      }
    }

    const topProjectsByFindings: Array<{ projectId: string; projectName: string; count: number }> =
      Array.isArray(topProjectsResult)
        ? topProjectsResult.map((item: any) => ({
            projectId: item.projectId,
            projectName: item.projectName,
            count: Number(item.count),
          }))
        : [];

    return {
      totalProjects,
      totalFindings,
      criticalFindings: severityDistribution[Severity.CRITICAL],
      highFindings: severityDistribution[Severity.HIGH],
      mediumFindings: severityDistribution[Severity.MEDIUM],
      lowFindings: severityDistribution[Severity.LOW],
      runningScans: runningScans + queueStats.scan.active + queueStats.scan.waiting,
      scansToday,
      findingsTrend,
      severityDistribution,
      scanTypeDistribution,
      topProjectsByFindings,
    };
  });

  fastify.get('/api/dashboard/trends', async (request) => {
    const query = z
      .object({
        days: z.coerce.number().int().min(7).max(365).default(30),
        metric: z.enum(['findings', 'scans']).default('findings'),
      })
      .parse(request.query);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - query.days);

    if (query.metric === 'findings') {
      const dd = getDefectDojoClient();

      if (dd.enabled) {
        try {
          const ddEngagements = await dd.listEngagements(undefined);
          if (ddEngagements.count > 0) {
            const dailyData: Record<string, Record<string, number>> = {};

            const today = new Date();
            for (let i = query.days - 1; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().split('T')[0];
              dailyData[dateStr] = {
                [Severity.CRITICAL]: 0,
                [Severity.HIGH]: 0,
                [Severity.MEDIUM]: 0,
                [Severity.LOW]: 0,
                [Severity.INFO]: 0,
              };
            }

            return {
              metric: query.metric,
              days: query.days,
              data: Object.entries(dailyData).map(([date, values]) => ({
                date,
                ...values,
                total: Object.values(values).reduce((a, b) => a + b, 0),
              })),
            };
          }
        } catch {
          // fall through to local
        }
      }

      const allFindings = await prisma.finding.findMany({
        where: { falsePositive: false, createdAt: { gte: startDate } },
        select: { id: true, dedupHash: true, createdAt: true, severity: true },
      });

      const deduped = dedupeFindingsLatest(allFindings);

      const dailyData: Record<string, Record<string, number>> = {};
      for (const f of deduped) {
        const dateStr = f.createdAt.toISOString().split('T')[0];
        if (!dailyData[dateStr]) {
          dailyData[dateStr] = {
            [Severity.CRITICAL]: 0,
            [Severity.HIGH]: 0,
            [Severity.MEDIUM]: 0,
            [Severity.LOW]: 0,
            [Severity.INFO]: 0,
          };
        }
        dailyData[dateStr][f.severity]++;
      }

      return {
        metric: query.metric,
        days: query.days,
        data: Object.entries(dailyData).map(([date, values]) => ({
          date,
          ...values,
          total: Object.values(values).reduce((a, b) => a + b, 0),
        })),
      };
    } else {
      const results = await prisma.$queryRaw<{ date: string; status: ScanStatus; count: number }[]>`
        SELECT 
          DATE_TRUNC('day', "triggeredAt")::date as date,
          status,
          COUNT(*)::integer as count
        FROM "ScanTask"
        WHERE "triggeredAt" >= ${startDate}
        GROUP BY DATE_TRUNC('day', "triggeredAt"), status
        ORDER BY date ASC
      `;

      const dailyData: Record<string, Record<string, number>> = {};
      for (const row of results as any[]) {
        const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
        if (!dailyData[dateStr]) {
          dailyData[dateStr] = {
            [ScanStatus.PENDING]: 0,
            [ScanStatus.RUNNING]: 0,
            [ScanStatus.COMPLETED]: 0,
            [ScanStatus.FAILED]: 0,
            [ScanStatus.CANCELLED]: 0,
          };
        }
        dailyData[dateStr][row.status] = Number(row.count);
      }

      return {
        metric: query.metric,
        days: query.days,
        data: Object.entries(dailyData).map(([date, values]) => ({
          date,
          ...values,
          total: Object.values(values).reduce((a, b) => a + b, 0),
        })),
      };
    }
  });

  fastify.get('/api/dashboard/distribution/severity', async (request) => {
    const query = z
      .object({
        projectId: z.string().optional(),
      })
      .parse(request.query);

    const dd = getDefectDojoClient();

    if (dd.enabled) {
      try {
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

        if (ddProductId) {
          const { distribution, total } = await getDDSeverityDistribution(dd, ddProductId);

          return {
            distribution,
            total,
            percentages: Object.fromEntries(
              Object.entries(distribution).map(([key, value]) => [
                key,
                total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
              ])
            ),
          };
        }
      } catch {
        // fall through
      }
    }

    const where: Record<string, unknown> = { falsePositive: false };
    if (query.projectId) where.projectId = query.projectId;

    const allFindings = await prisma.finding.findMany({
      where,
      select: { id: true, dedupHash: true, createdAt: true, severity: true },
    });

    const deduped = dedupeFindingsLatest(allFindings);

    const distribution: Record<Severity, number> = {
      [Severity.CRITICAL]: 0,
      [Severity.HIGH]: 0,
      [Severity.MEDIUM]: 0,
      [Severity.LOW]: 0,
      [Severity.INFO]: 0,
    };

    for (const f of deduped) {
      distribution[f.severity]++;
    }

    const total = deduped.length;

    return {
      distribution,
      total,
      percentages: Object.fromEntries(
        Object.entries(distribution).map(([key, value]) => [
          key,
          total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
        ])
      ),
    };
  });

  fastify.get('/api/dashboard/scan-type-distribution', async () => {
    const results = await prisma.scanTask.groupBy({
      by: ['type'],
      _count: { type: true },
    });

    const distribution: Record<ScanType, number> = {
      [ScanType.STATIC_SAST]: 0,
      [ScanType.STATIC_SCA]: 0,
      [ScanType.DYNAMIC_DAST]: 0,
      [ScanType.DYNAMIC_PLAYWRIGHT]: 0,
      [ScanType.MOBILE_MOBSF]: 0,
      [ScanType.API_NUCLEI]: 0,
    };

    for (const item of results) {
      distribution[item.type] = item._count.type;
    }

    const total = Object.values(distribution).reduce((a, b) => a + b, 0);

    return {
      distribution,
      total,
    };
  });

  fastify.get('/api/dashboard/recent-activity', async () => {
    const dd = getDefectDojoClient();

    const [recentScans, recentAuditLogs] = await Promise.all([
      prisma.scanTask.findMany({
        take: 10,
        orderBy: { triggeredAt: 'desc' },
        include: {
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    let recentFindings;
    if (dd.enabled) {
      const ddFindings = await dd.listFindings({
        false_p: false,
        limit: 10,
        ordering: '-created',
      });

      const projectMap = new Map<number, { id: string; name: string }>();
      const projects = await prisma.project.findMany({
        where: { defectdojoProductId: { not: null } },
        select: { id: true, name: true, defectdojoProductId: true },
      });
      for (const p of projects) {
        if (p.defectdojoProductId) {
          projectMap.set(p.defectdojoProductId, { id: p.id, name: p.name });
        }
      }

      recentFindings = ddFindings.results.map((f) => {
        const proj = projectMap.get(f.product);
        return {
          id: String(f.id),
          title: f.title,
          severity: f.severity.toUpperCase(),
          project: proj ?? { id: String(f.product), name: '' },
          createdAt: f.created,
        };
      });
    } else {
      const allFindings = await prisma.finding.findMany({
        where: { falsePositive: false },
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, name: true } },
        },
      });
      recentFindings = dedupeFindingsLatest(allFindings).slice(0, 10);
    }

    return {
      recentScans,
      recentFindings,
      recentAuditLogs,
    };
  });
};

export default dashboardRoutes;
