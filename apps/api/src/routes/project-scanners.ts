import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { addScanJob } from '../lib/queue.js';
import { ScanStatus, ScanType, PipelineStage } from '@prisma/client';

const SCAN_TYPE_DEFAULTS = [
  { type: ScanType.STATIC_SAST, name: 'SAST 静态代码扫描', description: 'SonarQube 源码白盒扫描', icon: 'code', defaultEnabled: true },
  { type: ScanType.STATIC_SCA, name: 'SCA 依赖成分分析', description: 'OSV-Scanner 离线依赖审计', icon: 'package', defaultEnabled: true },
  { type: ScanType.DYNAMIC_DAST, name: 'DAST 动态渗透测试', description: 'OWASP ZAP 黑盒漏洞扫描', icon: 'globe', defaultEnabled: false },
  { type: ScanType.DYNAMIC_PLAYWRIGHT, name: 'Playwright 爬虫扫描', description: '浏览器自动化 + 全链路 TraceId', icon: 'mouse-pointer-click', defaultEnabled: false },
  { type: ScanType.MOBILE_MOBSF, name: '移动端安全扫描', description: 'MobSF APK/IPA 逆向分析', icon: 'smartphone', defaultEnabled: false },
  { type: ScanType.API_NUCLEI, name: 'API/基础设施扫描', description: 'Nuclei YAML 模板扫描', icon: 'server', defaultEnabled: false },
];

const projectScannerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/projects/:id/scanner-configs', async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const configs = await prisma.projectScannerConfig.findMany({
      where: { projectId: id },
    });

    const configMap = new Map(configs.map((c) => [c.scanType, c]));

    const result = SCAN_TYPE_DEFAULTS.map((def) => {
      const cfg = configMap.get(def.type);
      return {
        scanType: def.type,
        name: def.name,
        description: def.description,
        icon: def.icon,
        enabled: cfg?.enabled ?? def.defaultEnabled,
        params: cfg?.params ?? null,
        schedule: cfg?.schedule ?? null,
        lastScanAt: cfg?.lastScanAt ?? null,
      };
    });

    return result;
  });

  fastify.put('/api/projects/:id/scanner-configs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      configs: z.array(
        z.object({
          scanType: z.nativeEnum(ScanType),
          enabled: z.boolean(),
          params: z.record(z.any()).optional().nullable(),
          schedule: z.string().optional().nullable(),
        })
      ),
    }).parse(request.body);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const results = [];
    for (const cfg of body.configs) {
      const result = await prisma.projectScannerConfig.upsert({
        where: {
          projectId_scanType: {
            projectId: id,
            scanType: cfg.scanType,
          },
        },
        create: {
          projectId: id,
          scanType: cfg.scanType,
          enabled: cfg.enabled,
          params: cfg.params || {},
          schedule: cfg.schedule || null,
        },
        update: {
          enabled: cfg.enabled,
          params: cfg.params || {},
          schedule: cfg.schedule || null,
        },
      });
      results.push(result);
    }

    await prisma.auditLog.create({
      data: {
        action: 'project.scanner_configs.update',
        userId: request.user.userId,
        projectId: id,
        metadata: { count: body.configs.length },
      },
    });

    return { updated: results.length };
  });

  fastify.post('/api/projects/:id/scan', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      scanTypes: z.array(z.nativeEnum(ScanType)).optional(),
      targetUrl: z.string().optional(),
      branch: z.string().default('main'),
      commitHash: z.string().optional(),
      pipelineStage: z.nativeEnum(PipelineStage).optional(),
    }).parse(request.body);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const configs = await prisma.projectScannerConfig.findMany({
      where: { projectId: id, enabled: true },
    });

    let enabledTypes = body.scanTypes?.length
      ? body.scanTypes
      : configs.map((c) => c.scanType);

    if (enabledTypes.length === 0) {
      enabledTypes = SCAN_TYPE_DEFAULTS.filter((d) => d.defaultEnabled).map((d) => d.type);
    }

    const scanTasks = [];
    const skipped = [];
    for (const scanType of enabledTypes) {
      const traceId = randomUUID();
      const target = body.targetUrl || undefined;

      if (scanType === ScanType.MOBILE_MOBSF) {
        const hasAppFile = project.type?.includes('MOBILE') && 
          (body as any).appFilePath;
        if (!hasAppFile) {
          skipped.push({ scanType, reason: '需要上传 APK/IPA 文件后才能进行移动端扫描' });
          continue;
        }
      }
      if ((scanType === ScanType.DYNAMIC_DAST || scanType === ScanType.DYNAMIC_PLAYWRIGHT || scanType === ScanType.API_NUCLEI) && !target) {
        skipped.push({ scanType, reason: '缺少 targetUrl，请提供目标 URL 后重试' });
        continue;
      }

      const scanTask = await prisma.scanTask.create({
        data: {
          type: scanType,
          status: ScanStatus.PENDING,
          projectId: id,
          pipelineStage: body.pipelineStage,
          targetUrl: target,
          branch: body.branch,
          commitHash: body.commitHash,
          triggeredBy: request.user.userId,
          traceId,
        },
      });

      await addScanJob({
        scanTaskId: scanTask.id,
        projectId: id,
        scanType,
        targetUrl: target,
        branch: body.branch,
        commitHash: body.commitHash,
        triggeredBy: request.user.userId,
        traceId,
      });

      scanTasks.push({
        id: scanTask.id,
        type: scanType,
        traceId,
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'project.scan.trigger',
        userId: request.user.userId,
        projectId: id,
        metadata: { scanTypes: enabledTypes, count: scanTasks.length },
      },
    });

    return reply.status(201).send({
      triggered: scanTasks.length,
      skipped: skipped.length,
      scanTasks,
      skippedScans: skipped,
    });
  });

  fastify.get('/api/projects/:id/scan-summary', async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const [totalScans, latestScans, allFindings] = await Promise.all([
      prisma.scanTask.count({ where: { projectId: id } }),
      prisma.scanTask.findMany({
        where: { projectId: id },
        orderBy: { triggeredAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          status: true,
          triggeredAt: true,
          completedAt: true,
          traceId: true,
        },
      }),
      prisma.finding.findMany({
        where: { projectId: id, falsePositive: false },
        select: { id: true, dedupHash: true, createdAt: true, severity: true },
      }),
    ]);

    const deduped = allFindings
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .filter((f, i, arr) => arr.findIndex((x) => x.dedupHash === f.dedupHash) === i);

    const bySeverity: Record<string, number> = {};
    for (const row of deduped) {
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    }

    return {
      totalScans,
      latestScans,
      findings: {
        total: deduped.length,
        bySeverity,
      },
    };
  });
};

export default projectScannerRoutes;
