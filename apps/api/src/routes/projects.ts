import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ProjectType, ProjectStatus, Severity, ScanType } from '@prisma/client';
import { getDefectDojoClient } from '../lib/defectdojo.js';

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

const DEFAULT_SCANNER_CONFIGS = [
  { type: ScanType.STATIC_SAST, enabled: true },
  { type: ScanType.STATIC_SCA, enabled: true },
  { type: ScanType.DYNAMIC_DAST, enabled: false },
  { type: ScanType.DYNAMIC_PLAYWRIGHT, enabled: false },
  { type: ScanType.MOBILE_MOBSF, enabled: false },
  { type: ScanType.API_NUCLEI, enabled: false },
];

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  productId: z.string().min(1).max(100),
  gitRepo: z.string().min(1),
  type: z.nativeEnum(ProjectType),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  gitRepo: z.string().min(1).optional(),
  type: z.nativeEnum(ProjectType).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  onboardingStage: z.number().int().min(0).max(5).optional(),
});

const projectQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.nativeEnum(ProjectType).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  search: z.string().optional(),
});

async function getFindingSummaryFromDD(productId: number): Promise<Record<Severity, number>> {
  const dd = getDefectDojoClient();
  const defaultSummary: Record<Severity, number> = {
    [Severity.CRITICAL]: 0,
    [Severity.HIGH]: 0,
    [Severity.MEDIUM]: 0,
    [Severity.LOW]: 0,
    [Severity.INFO]: 0,
  };

  if (!dd.enabled) return defaultSummary;

  try {
    const [critical, high, medium, low, info] = await Promise.all([
      dd.listFindings({ product: productId, severity: 'Critical', active: true, false_p: false, limit: 1 }).then(r => r.count).catch(() => 0),
      dd.listFindings({ product: productId, severity: 'High', active: true, false_p: false, limit: 1 }).then(r => r.count).catch(() => 0),
      dd.listFindings({ product: productId, severity: 'Medium', active: true, false_p: false, limit: 1 }).then(r => r.count).catch(() => 0),
      dd.listFindings({ product: productId, severity: 'Low', active: true, false_p: false, limit: 1 }).then(r => r.count).catch(() => 0),
      dd.listFindings({ product: productId, severity: 'Info', active: true, false_p: false, limit: 1 }).then(r => r.count).catch(() => 0),
    ]);

    return {
      [Severity.CRITICAL]: critical,
      [Severity.HIGH]: high,
      [Severity.MEDIUM]: medium,
      [Severity.LOW]: low,
      [Severity.INFO]: info,
    };
  } catch {
    return defaultSummary;
  }
}

const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/projects', async (request) => {
    const query = projectQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;
    const dd = getDefectDojoClient();

    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { productId: { contains: query.search, mode: 'insensitive' } },
        { gitRepo: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              scanTasks: true,
              findings: true,
            },
          },
        },
      }),
      prisma.project.count({ where }),
    ]);

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        let findingSummary: Record<Severity, number>;

        if (dd.enabled && project.defectdojoProductId) {
          findingSummary = await getFindingSummaryFromDD(project.defectdojoProductId);
        } else {
          const allFindings = await prisma.finding.findMany({
            where: { projectId: project.id, falsePositive: false },
            select: { id: true, dedupHash: true, createdAt: true, severity: true },
          });
          const deduped = dedupeFindingsLatest(allFindings);

          findingSummary = {
            [Severity.CRITICAL]: 0,
            [Severity.HIGH]: 0,
            [Severity.MEDIUM]: 0,
            [Severity.LOW]: 0,
            [Severity.INFO]: 0,
          };

          for (const item of deduped) {
            findingSummary[item.severity]++;
          }
        }

        return {
          ...project,
          findingSummary,
        };
      })
    );

    return {
      data: projectsWithStats,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dd = getDefectDojoClient();

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            scanTasks: true,
            findings: true,
          },
        },
      },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    let findingSummary: Record<Severity, number>;

    if (dd.enabled && project.defectdojoProductId) {
      findingSummary = await getFindingSummaryFromDD(project.defectdojoProductId);
    } else {
      const allFindings = await prisma.finding.findMany({
        where: { projectId: id, falsePositive: false },
        select: { id: true, dedupHash: true, createdAt: true, severity: true },
      });
      const deduped = dedupeFindingsLatest(allFindings);

      findingSummary = {
        [Severity.CRITICAL]: 0,
        [Severity.HIGH]: 0,
        [Severity.MEDIUM]: 0,
        [Severity.LOW]: 0,
        [Severity.INFO]: 0,
      };

      for (const item of deduped) {
        findingSummary[item.severity]++;
      }
    }

    return {
      ...project,
      findingSummary,
    };
  });

  fastify.post('/api/projects', async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const dd = getDefectDojoClient();

    const existing = await prisma.project.findUnique({
      where: { productId: body.productId },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Product ID already exists' });
    }

    let defectdojoProductId: number | undefined;

    if (dd.enabled) {
      try {
        const ddProduct = await dd.createProduct({
          name: body.name,
          description: `Product ID: ${body.productId}\nGit Repo: ${body.gitRepo}\nType: ${body.type}`,
          tags: [body.productId, body.type],
        });
        defectdojoProductId = ddProduct.id;
      } catch (err) {
        console.error('Failed to create DefectDojo product:', err);
      }
    }

    const project = await prisma.project.create({
      data: {
        ...body,
        defectdojoProductId,
      },
    });

    await prisma.projectScannerConfig.createMany({
      data: DEFAULT_SCANNER_CONFIGS.map((c) => ({
        projectId: project.id,
        scanType: c.type,
        enabled: c.enabled,
      })),
    });

    await prisma.auditLog.create({
      data: {
        action: 'project.create',
        userId: request.user.userId,
        projectId: project.id,
        metadata: { ...body, defectdojoProductId },
      },
    });

    return reply.status(201).send(project);
  });

  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateProjectSchema.parse(request.body);
    const dd = getDefectDojoClient();

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: body,
    });

    if (dd.enabled && project.defectdojoProductId && (body.name || body.type)) {
      try {
        await dd.updateProduct(project.defectdojoProductId, {
          name: body.name,
          tags: body.type ? [project.productId, body.type] : undefined,
        });
      } catch (err) {
        console.error('Failed to update DefectDojo product:', err);
      }
    }

    await prisma.auditLog.create({
      data: {
        action: 'project.update',
        userId: request.user.userId,
        projectId: id,
        metadata: { ...body },
      },
    });

    return updated;
  });

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dd = getDefectDojoClient();

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    if (dd.enabled && project.defectdojoProductId) {
      try {
        await dd.deleteProduct(project.defectdojoProductId);
      } catch (err) {
        console.error('Failed to delete DefectDojo product:', err);
      }
    }

    await prisma.auditLog.create({
      data: {
        action: 'project.delete',
        userId: request.user.userId,
        projectId: id,
        metadata: { name: project.name, productId: project.productId },
      },
    });

    await prisma.project.delete({ where: { id } });

    return reply.status(204).send();
  });

  fastify.get('/api/projects/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dd = getDefectDojoClient();

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    let findingSummary: Record<Severity, number>;
    let totalFindings = 0;
    let localTopFindings: Array<{ id: string; title: string; severity: Severity; cwe: string | null; cve: string | null; cvss: number | null; description: string; location: string | null; filePath: string | null; lineStart: number | null; lineEnd: number | null; scanId: string; projectId: string; dedupHash: string; falsePositive: boolean; createdAt: Date; updatedAt: Date; }> = [];

    if (dd.enabled && project.defectdojoProductId) {
      findingSummary = await getFindingSummaryFromDD(project.defectdojoProductId);
      totalFindings = Object.values(findingSummary).reduce((a, b) => a + b, 0);
    } else {
      const allFindings = await prisma.finding.findMany({
        where: { projectId: id, falsePositive: false },
        orderBy: [
          { severity: 'desc' },
          { createdAt: 'desc' },
        ],
      });
      const deduped = dedupeFindingsLatest(allFindings);

      findingSummary = {
        [Severity.CRITICAL]: 0,
        [Severity.HIGH]: 0,
        [Severity.MEDIUM]: 0,
        [Severity.LOW]: 0,
        [Severity.INFO]: 0,
      };

      for (const item of deduped) {
        findingSummary[item.severity]++;
        totalFindings++;
      }

      localTopFindings = deduped.slice(0, 10);
    }

    const [totalScans, last30DaysScans, ddTopFindings] = await Promise.all([
      prisma.scanTask.count({ where: { projectId: id } }),
      prisma.scanTask.count({
        where: {
          projectId: id,
          triggeredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      dd.enabled && project.defectdojoProductId
        ? dd.listFindings({
            product: project.defectdojoProductId,
            active: true,
            false_p: false,
            limit: 10,
            ordering: '-numerical_severity,-created',
          }).then(r => r.results.map(f => ({
            id: String(f.id),
            title: f.title,
            severity: f.severity.toUpperCase() as Severity,
            cwe: f.cwe ? String(f.cwe) : null,
            cve: f.cve,
            cvss: f.cvssv3_score ?? null,
            description: f.description ?? '',
            location: f.url ?? f.file_path ?? null,
            filePath: f.file_path,
            lineStart: f.line,
            lineEnd: null,
            scanId: String(f.test),
            projectId: id,
            dedupHash: '',
            falsePositive: f.false_p ?? false,
            createdAt: f.created,
            updatedAt: f.updated,
          })))
        : Promise.resolve(null),
    ]);

    const topFindings = ddTopFindings ?? localTopFindings;

    return {
      findingSummary,
      totalFindings,
      totalScans,
      last30DaysScans,
      lastScanAt: project.lastScanAt,
      topFindings,
    };
  });

  fastify.post('/api/projects/:id/sync-defectdojo', async (request, reply) => {
    const { id } = request.params as { id: string };
    const dd = getDefectDojoClient();

    if (!dd.enabled) {
      return reply.status(400).send({ error: 'DefectDojo is not configured' });
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    if (project.defectdojoProductId) {
      try {
        const ddProduct = await dd.getProduct(project.defectdojoProductId);
        return {
          message: 'Already synced',
          defectdojoProduct: ddProduct,
        };
      } catch {
        // product not found in DD, create a new one
      }
    }

    const ddProduct = await dd.createProduct({
      name: project.name,
      description: `Product ID: ${project.productId}\nGit Repo: ${project.gitRepo}\nType: ${project.type}`,
      tags: [project.productId, project.type],
    });

    await prisma.project.update({
      where: { id },
      data: { defectdojoProductId: ddProduct.id },
    });

    await prisma.auditLog.create({
      data: {
        action: 'project.sync_defectdojo',
        userId: request.user.userId,
        projectId: id,
        metadata: { defectdojoProductId: ddProduct.id },
      },
    });

    return reply.status(201).send({
      message: 'Synced to DefectDojo',
      defectdojoProduct: ddProduct,
    });
  });
};

export default projectsRoutes;
