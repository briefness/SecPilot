import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { DyeLogAction, DyeLogResult } from '@prisma/client';
import { TrafficDye } from '@secops/traffic-dye';

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(true),
  salt: z.string().min(8).max(200),
  timeWindowSeconds: z.number().int().min(60).max(86400).default(300),
  headerSimulation: z.string().min(1).max(100).default('X-SecOps-Simulation'),
  headerSign: z.string().min(1).max(100).default('X-SecOps-Sign'),
  headerTimestamp: z.string().min(1).max(100).default('X-SecOps-Timestamp'),
  headerTraceId: z.string().min(1).max(100).default('X-B3-TraceId'),
  shadowRedisPrefix: z.string().max(100).default('secops:shadow:'),
  shadowMqSuffix: z.string().max(50).default('-shadow'),
});

const updateRuleSchema = createRuleSchema.partial();

const ruleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  enabled: z.coerce.boolean().optional(),
});

const whitelistCreateSchema = z.object({
  ruleId: z.string(),
  ip: z.string().min(1).max(50),
  note: z.string().max(200).optional(),
});

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ruleId: z.string().optional(),
  action: z.nativeEnum(DyeLogAction).optional(),
  result: z.nativeEnum(DyeLogResult).optional(),
  traceId: z.string().optional(),
});

const generateSchema = z.object({
  ruleId: z.string(),
  traceId: z.string().optional(),
});

const verifySchema = z.object({
  ruleId: z.string(),
  headers: z.record(z.string().or(z.array(z.string())).optional()),
  clientIp: z.string().optional(),
});

function createTrafficDyeFromRule(rule: {
  salt: string;
  timeWindowSeconds: number;
  headerSimulation: string;
  headerSign: string;
  headerTimestamp: string;
  headerTraceId: string;
  shadowRedisPrefix: string;
  shadowMqSuffix: string;
}, whitelistIps: string[]) {
  return new TrafficDye({
    salt: rule.salt,
    timeWindowSeconds: rule.timeWindowSeconds,
    headerSimulation: rule.headerSimulation,
    headerSign: rule.headerSign,
    headerTimestamp: rule.headerTimestamp,
    headerTraceId: rule.headerTraceId,
    ipWhitelist: whitelistIps,
    shadowRedisPrefix: rule.shadowRedisPrefix,
    shadowMqSuffix: rule.shadowMqSuffix,
  });
}

const trafficDyeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/traffic-dye/rules', async (request) => {
    const query = ruleQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.enabled !== undefined) where.enabled = query.enabled;

    const [rules, total] = await Promise.all([
      prisma.dyeRule.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { whitelistEntries: true, dyeLogs: true },
          },
        },
      }),
      prisma.dyeRule.count({ where }),
    ]);

    return {
      data: rules,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/traffic-dye/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const rule = await prisma.dyeRule.findUnique({
      where: { id },
      include: {
        whitelistEntries: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { dyeLogs: true },
        },
      },
    });

    if (!rule) {
      return reply.status(404).send({ error: 'Dye rule not found' });
    }

    return rule;
  });

  fastify.post('/api/traffic-dye/rules', async (request, reply) => {
    const body = createRuleSchema.parse(request.body);

    const existing = await prisma.dyeRule.findUnique({ where: { name: body.name } });
    if (existing) {
      return reply.status(409).send({ error: 'Rule name already exists' });
    }

    const rule = await prisma.dyeRule.create({
      data: body,
    });

    await prisma.auditLog.create({
      data: {
        action: 'dye_rule.create',
        userId: request.user.userId,
        metadata: { ruleId: rule.id, name: rule.name },
      },
    });

    return reply.status(201).send(rule);
  });

  fastify.put('/api/traffic-dye/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateRuleSchema.parse(request.body);

    const existing = await prisma.dyeRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Dye rule not found' });
    }

    if (body.name && body.name !== existing.name) {
      const nameTaken = await prisma.dyeRule.findUnique({ where: { name: body.name } });
      if (nameTaken) {
        return reply.status(409).send({ error: 'Rule name already exists' });
      }
    }

    const rule = await prisma.dyeRule.update({
      where: { id },
      data: body,
    });

    await prisma.auditLog.create({
      data: {
        action: 'dye_rule.update',
        userId: request.user.userId,
        metadata: { ruleId: id, changes: Object.keys(body) },
      },
    });

    return rule;
  });

  fastify.delete('/api/traffic-dye/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.dyeRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Dye rule not found' });
    }

    await prisma.dyeRule.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'dye_rule.delete',
        userId: request.user.userId,
        metadata: { ruleId: id, name: existing.name },
      },
    });

    return reply.status(204).send();
  });

  fastify.post('/api/traffic-dye/whitelist', async (request, reply) => {
    const body = whitelistCreateSchema.parse(request.body);

    const rule = await prisma.dyeRule.findUnique({ where: { id: body.ruleId } });
    if (!rule) {
      return reply.status(404).send({ error: 'Dye rule not found' });
    }

    const existing = await prisma.dyeWhitelist.findUnique({
      where: { ruleId_ip: { ruleId: body.ruleId, ip: body.ip } },
    });
    if (existing) {
      return reply.status(409).send({ error: 'IP already in whitelist' });
    }

    const entry = await prisma.dyeWhitelist.create({
      data: {
        ruleId: body.ruleId,
        ip: body.ip,
        note: body.note,
      },
    });

    return reply.status(201).send(entry);
  });

  fastify.delete('/api/traffic-dye/whitelist/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.dyeWhitelist.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Whitelist entry not found' });
    }

    await prisma.dyeWhitelist.delete({ where: { id } });

    return reply.status(204).send();
  });

  fastify.get('/api/traffic-dye/logs', async (request) => {
    const query = logQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.ruleId) where.ruleId = query.ruleId;
    if (query.action) where.action = query.action;
    if (query.result) where.result = query.result;
    if (query.traceId) where.traceId = query.traceId;

    const [logs, total] = await Promise.all([
      prisma.dyeLog.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          rule: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.dyeLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.post('/api/traffic-dye/generate', async (request, reply) => {
    const body = generateSchema.parse(request.body);

    const rule = await prisma.dyeRule.findUnique({ where: { id: body.ruleId } });
    if (!rule) {
      return reply.status(404).send({ error: 'Dye rule not found' });
    }

    if (!rule.enabled) {
      return reply.status(400).send({ error: 'Dye rule is disabled' });
    }

    const whitelistEntries = await prisma.dyeWhitelist.findMany({
      where: { ruleId: body.ruleId },
      select: { ip: true },
    });
    const whitelistIps = whitelistEntries.map((e) => e.ip);

    const td = createTrafficDyeFromRule(rule, whitelistIps);
    const headers = td.generateHeaders(body.traceId);

    await prisma.dyeLog.create({
      data: {
        ruleId: body.ruleId,
        action: DyeLogAction.GENERATE,
        result: DyeLogResult.SUCCESS,
        traceId: body.traceId,
        clientIp: request.ip,
      },
    });

    return { headers, traceId: body.traceId };
  });

  fastify.post('/api/traffic-dye/verify', async (request, reply) => {
    const body = verifySchema.parse(request.body);

    const rule = await prisma.dyeRule.findUnique({ where: { id: body.ruleId } });
    if (!rule) {
      return reply.status(404).send({ error: 'Dye rule not found' });
    }

    if (!rule.enabled) {
      return reply.status(400).send({ error: 'Dye rule is disabled' });
    }

    const whitelistEntries = await prisma.dyeWhitelist.findMany({
      where: { ruleId: body.ruleId },
      select: { ip: true },
    });
    const whitelistIps = whitelistEntries.map((e) => e.ip);

    const td = createTrafficDyeFromRule(rule, whitelistIps);
    const result = td.verify(body.headers, body.clientIp);

    await prisma.dyeLog.create({
      data: {
        ruleId: body.ruleId,
        action: DyeLogAction.VERIFY,
        result: result.valid ? DyeLogResult.SUCCESS : DyeLogResult.FAILED,
        traceId: result.traceId,
        clientIp: body.clientIp,
        reason: result.reason,
      },
    });

    return result;
  });

  fastify.get('/api/traffic-dye/stats/summary', async () => {
    const [totalRules, enabledRules, totalLogs, todayLogs, successLogs, failedLogs] = await Promise.all([
      prisma.dyeRule.count(),
      prisma.dyeRule.count({ where: { enabled: true } }),
      prisma.dyeLog.count(),
      prisma.dyeLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      prisma.dyeLog.count({ where: { result: DyeLogResult.SUCCESS } }),
      prisma.dyeLog.count({ where: { result: DyeLogResult.FAILED } }),
    ]);

    return {
      totalRules,
      enabledRules,
      totalLogs,
      todayLogs,
      successLogs,
      failedLogs,
    };
  });
};

export default trafficDyeRoutes;
