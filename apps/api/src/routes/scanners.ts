import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ScanType } from '@prisma/client';

const scannerDefaults: Array<{
  type: ScanType;
  name: string;
  description: string;
  icon: string;
  defaultParams: any;
}> = [
  {
    type: ScanType.STATIC_SAST,
    name: 'SAST 静态代码分析',
    description: '扫描源代码中的安全漏洞和编码缺陷，支持多种编程语言',
    icon: 'Code2',
    defaultParams: {
      scanDepth: 'deep',
      severityFilter: ['critical', 'high', 'medium', 'low'],
      excludedPaths: ['node_modules', 'dist', 'build', '.git'],
    },
  },
  {
    type: ScanType.STATIC_SCA,
    name: 'SCA 依赖漏洞扫描',
    description: '检测项目依赖的第三方组件中的已知漏洞（CVE）',
    icon: 'Package',
    defaultParams: {
      includeDev: false,
      severityFilter: ['critical', 'high', 'medium'],
      autoUpgrade: false,
    },
  },
  {
    type: ScanType.DYNAMIC_DAST,
    name: 'DAST 动态黑盒扫描',
    description: '模拟黑客攻击，从外部测试运行中 Web 应用的安全漏洞',
    icon: 'Globe',
    defaultParams: {
      scanMode: 'standard',
      spiderDepth: 5,
      activeScan: true,
      passiveScan: true,
    },
  },
  {
    type: ScanType.DYNAMIC_PLAYWRIGHT,
    name: 'Playwright 爬虫扫描',
    description: '浏览器自动化爬虫，支持全链路 TraceId 流量染色',
    icon: 'MousePointerClick',
    defaultParams: {
      maxPages: 50,
      useZapProxy: true,
      enableTrafficDye: false,
      crawlUrls: [],
    },
  },
  {
    type: ScanType.MOBILE_MOBSF,
    name: 'MobSF 移动安全扫描',
    description: 'iOS/Android 安装包静态逆向分析，检测隐私泄露和安全配置问题',
    icon: 'Smartphone',
    defaultParams: {
      scanType: 'static',
      includeReversedCode: true,
      severityFilter: ['critical', 'high', 'medium'],
    },
  },
  {
    type: ScanType.API_NUCLEI,
    name: 'Nuclei API 安全扫描',
    description: '基于 YAML 模板的高并发漏洞扫描引擎，应对 1day/0day 漏洞',
    icon: 'Zap',
    defaultParams: {
      templates: ['cves', 'vulnerabilities', 'exposures'],
      severityFilter: ['critical', 'high'],
      rateLimit: 150,
      timeout: 10,
    },
  },
];

const updateScannerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  defaultParams: z.any().optional(),
  docUrl: z.string().url().optional().nullable(),
});

async function ensureDefaultScanners() {
  const count = await prisma.scannerConfig.count();
  if (count > 0) return;

  for (const s of scannerDefaults) {
    const existing = await prisma.scannerConfig.findUnique({ where: { type: s.type } });
    if (!existing) {
      await prisma.scannerConfig.create({
        data: {
          type: s.type,
          name: s.name,
          description: s.description,
          icon: s.icon,
          defaultParams: s.defaultParams,
        },
      });
    }
  }
}

const scannerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async () => {
    await ensureDefaultScanners();
  });

  fastify.get('/api/scanners', async () => {
    const scanners = await prisma.scannerConfig.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return { data: scanners };
  });

  fastify.get('/api/scanners/:type', async (request, reply) => {
    const { type } = request.params as { type: string };

    const scanner = await prisma.scannerConfig.findUnique({
      where: { type: type as ScanType },
    });

    if (!scanner) {
      return reply.status(404).send({ error: 'Scanner not found' });
    }

    return scanner;
  });

  fastify.put('/api/scanners/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const body = updateScannerSchema.parse(request.body);

    const existing = await prisma.scannerConfig.findUnique({
      where: { type: type as ScanType },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Scanner not found' });
    }

    const updated = await prisma.scannerConfig.update({
      where: { type: type as ScanType },
      data: body,
    });

    await prisma.auditLog.create({
      data: {
        action: 'scanner.update',
        userId: request.user.userId,
        metadata: { type, changes: Object.keys(body) },
      },
    });

    return updated;
  });

  fastify.patch('/api/scanners/:type/toggle', async (request, reply) => {
    const { type } = request.params as { type: string };

    const existing = await prisma.scannerConfig.findUnique({
      where: { type: type as ScanType },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Scanner not found' });
    }

    const updated = await prisma.scannerConfig.update({
      where: { type: type as ScanType },
      data: { enabled: !existing.enabled },
    });

    await prisma.auditLog.create({
      data: {
        action: `scanner.${updated.enabled ? 'enable' : 'disable'}`,
        userId: request.user.userId,
        metadata: { type },
      },
    });

    return updated;
  });

  fastify.get('/api/scanners/stats/summary', async () => {
    const [total, enabled] = await Promise.all([
      prisma.scannerConfig.count(),
      prisma.scannerConfig.count({ where: { enabled: true } }),
    ]);

    return {
      total,
      enabled,
      disabled: total - enabled,
    };
  });
};

export default scannerRoutes;
