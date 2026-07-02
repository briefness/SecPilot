import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { Severity, ScanType } from '@prisma/client';

const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  projectId: z.string().optional(),
});

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/reports/vulnerability-trend', async (request) => {
    const query = reportQuerySchema.parse(request.query);

    const now = query.to || new Date();
    const thirtyDaysAgo = query.from || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const findings = await prisma.finding.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo, lte: now },
        ...(query.projectId ? { projectId: query.projectId } : {}),
      },
      select: {
        createdAt: true,
        severity: true,
        falsePositive: true,
      },
    });

    const days: Record<string, Record<Severity, number>> = {};
    const start = new Date(thirtyDaysAgo);
    while (start <= now) {
      const dateStr = start.toISOString().split('T')[0];
      days[dateStr] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
      start.setDate(start.getDate() + 1);
    }

    for (const f of findings) {
      if (f.falsePositive) continue;
      const dateStr = f.createdAt.toISOString().split('T')[0];
      if (days[dateStr]) {
        days[dateStr][f.severity]++;
      }
    }

    const trend = Object.entries(days).map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.LOW + counts.INFO,
    }));

    return { trend };
  });

  fastify.get('/api/reports/severity-distribution', async (request) => {
    const query = reportQuerySchema.parse(request.query);

    const where: Record<string, unknown> = { falsePositive: false };
    if (query.projectId) where.projectId = query.projectId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as Record<string, Date>).gte = query.from;
      if (query.to) (where.createdAt as Record<string, Date>).lte = query.to;
    }

    const [critical, high, medium, low, info] = await Promise.all([
      prisma.finding.count({ where: { ...where, severity: Severity.CRITICAL } }),
      prisma.finding.count({ where: { ...where, severity: Severity.HIGH } }),
      prisma.finding.count({ where: { ...where, severity: Severity.MEDIUM } }),
      prisma.finding.count({ where: { ...where, severity: Severity.LOW } }),
      prisma.finding.count({ where: { ...where, severity: Severity.INFO } }),
    ]);

    const total = critical + high + medium + low + info;

    return {
      bySeverity: { CRITICAL: critical, HIGH: high, MEDIUM: medium, LOW: low, INFO: info },
      total,
    };
  });

  fastify.get('/api/reports/project-compliance', async () => {
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: { findings: true, scanTasks: true },
        },
        findings: {
          where: { falsePositive: false },
          select: { severity: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const compliance = projects.map((p) => {
      const critical = p.findings.filter((f) => f.severity === Severity.CRITICAL).length;
      const high = p.findings.filter((f) => f.severity === Severity.HIGH).length;
      const medium = p.findings.filter((f) => f.severity === Severity.MEDIUM).length;
      const low = p.findings.filter((f) => f.severity === Severity.LOW).length;

      let status: 'compliant' | 'warning' | 'critical' | 'unknown';
      if (p._count.scanTasks === 0) {
        status = 'unknown';
      } else if (critical > 0) {
        status = 'critical';
      } else if (high > 0) {
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
        findingsCount: { CRITICAL: critical, HIGH: high, MEDIUM: medium, LOW: low },
        totalFindings: p._count.findings,
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

    const scanTypes = [ScanType.STATIC_SAST, ScanType.STATIC_SCA, ScanType.DYNAMIC_H5, ScanType.MOBILE_MOBSF, ScanType.API_NUCLEI];

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
    const projects = await prisma.project.findMany({
      include: {
        findings: {
          where: { falsePositive: false },
          select: { severity: true },
        },
      },
    });

    const ranked = projects
      .map((p) => {
        const critical = p.findings.filter((f) => f.severity === Severity.CRITICAL).length;
        const high = p.findings.filter((f) => f.severity === Severity.HIGH).length;
        const medium = p.findings.filter((f) => f.severity === Severity.MEDIUM).length;
        const score = critical * 10 + high * 5 + medium * 2;
        return {
          id: p.id,
          name: p.name,
          productId: p.productId,
          critical,
          high,
          medium,
          total: p.findings.length,
          riskScore: score,
        };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    return { projects: ranked };
  });
};

export default reportsRoutes;
