import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { UserRole, ConfigCategory } from '@prisma/client';

const configValueSchema = z.record(z.any());

const updateConfigSchema = z.object({
  value: configValueSchema,
});

const configQuerySchema = z.object({
  category: z.nativeEnum(ConfigCategory).optional(),
});

const DEFAULT_CONFIGS: Array<{ key: string; category: ConfigCategory; value: Record<string, unknown>; description: string }> = [
  {
    key: 'general.platform',
    category: ConfigCategory.GENERAL,
    value: { name: 'SecPilot', version: '1.0.0', timezone: 'Asia/Shanghai' },
    description: '平台基础信息',
  },
  {
    key: 'general.security_policy',
    category: ConfigCategory.SECURITY,
    value: {
      criticalBlocking: true,
      highBlocking: true,
      mediumBlocking: false,
      mediumGraceDays: 7,
      lowGraceDays: 30,
      autoDedup: true,
    },
    description: '安全策略与熔断配置',
  },
  {
    key: 'notification.email',
    category: ConfigCategory.NOTIFICATION,
    value: { enabled: false, host: '', port: 587, user: '', from: '' },
    description: '邮件通知配置',
  },
  {
    key: 'notification.slack',
    category: ConfigCategory.NOTIFICATION,
    value: { enabled: false, webhookUrl: '', channel: '#secops-alerts' },
    description: 'Slack 通知配置',
  },
  {
    key: 'notification.pagerduty',
    category: ConfigCategory.NOTIFICATION,
    value: { enabled: false, integrationKey: '', severity: 'critical' },
    description: 'PagerDuty 通知配置',
  },
  {
    key: 'integration.defectdojo',
    category: ConfigCategory.INTEGRATION,
    value: { enabled: false, baseUrl: '', apiKey: '' },
    description: 'DefectDojo 集成配置',
  },
  {
    key: 'integration.gitlab',
    category: ConfigCategory.INTEGRATION,
    value: { enabled: false, baseUrl: '', token: '', groupId: '' },
    description: 'GitLab 集成配置',
  },
  {
    key: 'integration.sonarqube',
    category: ConfigCategory.INTEGRATION,
    value: { enabled: false, baseUrl: '', token: '' },
    description: 'SonarQube 集成配置',
  },
];

async function ensureDefaultConfigs() {
  for (const cfg of DEFAULT_CONFIGS) {
    const existing = await prisma.systemConfig.findUnique({ where: { key: cfg.key } });
    if (!existing) {
      await prisma.systemConfig.create({
        data: {
          key: cfg.key,
          value: cfg.value as any,
          category: cfg.category,
          description: cfg.description,
        },
      });
    }
  }
}

const systemConfigRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  });

  fastify.get('/api/configs', async (request) => {
    await ensureDefaultConfigs();
    const query = configQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.category) where.category = query.category;

    const configs = await prisma.systemConfig.findMany({
      where,
      orderBy: { key: 'asc' },
    });

    return configs;
  });

  fastify.get('/api/configs/:key', async (request, reply) => {
    const { key } = request.params as { key: string };

    const config = await prisma.systemConfig.findUnique({ where: { key } });
    if (!config) {
      return reply.status(404).send({ error: 'Config not found' });
    }

    return config;
  });

  fastify.put('/api/configs/:key', async (request) => {
    const { key } = request.params as { key: string };
    const body = updateConfigSchema.parse(request.body);

    const existing = await prisma.systemConfig.findUnique({ where: { key } });

    let config;
    if (existing) {
      config = await prisma.systemConfig.update({
        where: { key },
        data: {
          value: body.value as any,
          updatedBy: request.user.userId,
        },
      });
    } else {
      config = await prisma.systemConfig.create({
        data: {
          key,
          value: body.value as any,
          updatedBy: request.user.userId,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: 'config.update',
        userId: request.user.userId,
        metadata: { key, category: config.category },
      },
    });

    return config;
  });

  fastify.get('/api/configs/category/:category', async (request, reply) => {
    const { category } = request.params as { category: string };

    if (!Object.values(ConfigCategory).includes(category as ConfigCategory)) {
      return reply.status(400).send({ error: 'Invalid category' });
    }

    await ensureDefaultConfigs();

    const configs = await prisma.systemConfig.findMany({
      where: { category: category as ConfigCategory },
      orderBy: { key: 'asc' },
    });

    const result: Record<string, unknown> = {};
    for (const cfg of configs) {
      result[cfg.key] = cfg.value;
    }

    return result;
  });
};

export default systemConfigRoutes;
