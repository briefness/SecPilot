import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { hash } from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { Severity, ScanStatus, ScanType, FindingStatus, ApiKeyScope, BypassStatus } from '@prisma/client';
import { computeDedupHash, dedupeLatest } from '../utils/dedup.js';
import { verifyToken } from '../lib/encryption.js';

const BCRYPT_ROUNDS = 12;

const findingSchema = z.object({
  title: z.string().min(1),
  severity: z.union([
    z.nativeEnum(Severity),
    z.enum(['critical', 'high', 'medium', 'low', 'info'])
      .transform((v) => v.toUpperCase() as Severity),
  ]),
  cwe: z.string().nullable().optional(),
  cve: z.string().nullable().optional(),
  cvss: z.number().min(0).max(10).nullable().optional(),
  description: z.string().min(1),
  location: z.string().nullable().optional(),
  filePath: z.string().nullable().optional(),
  lineStart: z.number().int().nullable().optional(),
  lineEnd: z.number().int().nullable().optional(),
  falsePositive: z.boolean().default(false),
});

const scanReportSchema = z.object({
  scanType: z.union([
    z.nativeEnum(ScanType),
    z.enum(['static_sast', 'static_sca', 'dynamic_h5', 'mobile_mobsf', 'api_nuclei'])
      .transform((v) => v.toUpperCase() as ScanType),
  ]),
  projectId: z.string(),
  pipelineStage: z.enum(['DAY_FAST_SCAN', 'NIGHT_DEEP_SCAN', 'RELEASE_AUDIT', 'EMERGENCY_PATROL']).optional(),
  scanId: z.string().optional(),
  targetUrl: z.string().optional(),
  branch: z.string().optional(),
  commitHash: z.string().optional(),
  scanDurationSeconds: z.number().int().min(0).optional(),
  findings: z.array(findingSchema).default([]),
  traceId: z.string().optional(),
});

const gateCheckSchema = z.object({
  projectId: z.string(),
  scanId: z.string().optional(),
  minSeverity: z.union([
    z.nativeEnum(Severity),
    z.enum(['critical', 'high', 'medium', 'low', 'info'])
      .transform((v) => v.toUpperCase() as Severity),
  ]).default(Severity.HIGH),
  failOnAny: z.boolean().default(false),
});

let cachedSystemUserId: string | null = null;

async function getSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId;

  let systemUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!systemUser) {
    const randomPassword = Math.random().toString(36) + Math.random().toString(36);
    const passwordHash = await hash(randomPassword, BCRYPT_ROUNDS);
    systemUser = await prisma.user.create({
      data: {
        email: 'system@secops.local',
        name: 'System Bot',
        role: 'ADMIN',
        passwordHash,
      },
      select: { id: true },
    });
  }

  cachedSystemUserId = systemUser.id;
  return cachedSystemUserId;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function validateApiKey(request: any, requiredScope: ApiKeyScope): Promise<{ valid: boolean; keyId?: string; projectId?: string; error?: string; code?: string; createdBy?: string }> {
  const authHeader = request.headers['authorization'] || request.headers['x-api-key'];
  if (!authHeader) {
    return { valid: false, error: 'Missing API key' };
  }

  let key = authHeader;
  if (key.startsWith('Bearer ')) {
    key = key.slice(7);
  }

  const keyHash = hashKey(key);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, scope: true, projectId: true, expiresAt: true, createdBy: true },
  });

  if (!apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return { valid: false, error: 'API key expired' };
  }

  const allowedScopes = [requiredScope, ApiKeyScope.ADMIN];
  if (!allowedScopes.includes(apiKey.scope)) {
    return { valid: false, error: 'Insufficient scope', code: 'INSUFFICIENT_SCOPE' };
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return { valid: true, keyId: apiKey.id, projectId: apiKey.projectId ?? undefined, createdBy: apiKey.createdBy };
}

const scannerIntegrationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/integrations/scanner/report', async (request, reply) => {
    const auth = await validateApiKey(request, ApiKeyScope.SCANNER);
    if (!auth.valid) {
      const status = auth.code === 'INSUFFICIENT_SCOPE' ? 403 : 401;
      return reply.status(status).send({ error: auth.error });
    }

    const body = scanReportSchema.parse(request.body);

    if (auth.projectId && auth.projectId !== body.projectId) {
      return reply.status(403).send({ error: 'API key not authorized for this project' });
    }

    const project = await prisma.project.findUnique({
      where: { id: body.projectId },
      select: { id: true },
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const scanTask = await prisma.scanTask.create({
      data: {
        type: body.scanType,
        status: ScanStatus.COMPLETED,
        projectId: body.projectId,
        pipelineStage: body.pipelineStage as any,
        targetUrl: body.targetUrl,
        branch: body.branch,
        commitHash: body.commitHash,
        triggeredBy: 'scanner_api',
        startedAt: body.scanDurationSeconds ? new Date(Date.now() - body.scanDurationSeconds * 1000) : new Date(),
        completedAt: new Date(),
        durationSeconds: body.scanDurationSeconds,
        traceId: body.traceId,
        findingsCritical: body.findings.filter(f => f.severity === Severity.CRITICAL).length,
        findingsHigh: body.findings.filter(f => f.severity === Severity.HIGH).length,
        findingsMedium: body.findings.filter(f => f.severity === Severity.MEDIUM).length,
        findingsLow: body.findings.filter(f => f.severity === Severity.LOW).length,
        findingsInfo: body.findings.filter(f => f.severity === Severity.INFO).length,
      },
    });

    const findingsData = body.findings.map((f) => {
      const dedupHash = computeDedupHash({
        cwe: f.cwe ?? undefined,
        filePath: f.filePath ?? undefined,
        lineStart: f.lineStart ?? undefined,
        location: f.location ?? undefined,
        title: f.title,
      });
      return {
        title: f.title,
        severity: f.severity,
        cwe: f.cwe ?? undefined,
        cve: f.cve ?? undefined,
        cvss: f.cvss ?? undefined,
        description: f.description,
        location: f.location ?? undefined,
        filePath: f.filePath ?? undefined,
        lineStart: f.lineStart ?? undefined,
        lineEnd: f.lineEnd ?? undefined,
        scanId: scanTask.id,
        projectId: body.projectId,
        dedupHash,
        falsePositive: f.falsePositive,
        status: f.falsePositive ? FindingStatus.FALSE_POSITIVE : FindingStatus.NEW,
      };
    });

    let created = 0;
    let duplicates = 0;

    if (findingsData.length > 0) {
      const existingHashes = new Set(
        (await prisma.finding.findMany({
          where: {
            projectId: body.projectId,
            dedupHash: { in: findingsData.map(f => f.dedupHash) },
            falsePositive: false,
          },
          select: { dedupHash: true },
        })).map(f => f.dedupHash)
      );

      const newFindings = findingsData.filter(f => !existingHashes.has(f.dedupHash));
      duplicates = findingsData.length - newFindings.length;

      if (newFindings.length > 0) {
        await prisma.finding.createMany({
          data: newFindings,
          skipDuplicates: true,
        });
        created = newFindings.length;
      }
    }

    await prisma.project.update({
      where: { id: body.projectId },
      data: { lastScanAt: new Date() },
    });

    const systemUserId = await getSystemUserId();
    await prisma.auditLog.create({
      data: {
        action: 'scanner.report_received',
        userId: systemUserId,
        projectId: body.projectId,
        metadata: {
          scanId: scanTask.id,
          scanType: body.scanType,
          totalFindings: body.findings.length,
          created,
          duplicates,
          source: 'api_key',
          apiKeyId: auth.keyId,
        },
      },
    });

    return reply.status(201).send({
      scanId: scanTask.id,
      status: ScanStatus.COMPLETED,
      findings: {
        total: body.findings.length,
        created,
        duplicates,
        bySeverity: {
          CRITICAL: scanTask.findingsCritical,
          HIGH: scanTask.findingsHigh,
          MEDIUM: scanTask.findingsMedium,
          LOW: scanTask.findingsLow,
          INFO: scanTask.findingsInfo,
        },
      },
    });
  });

  fastify.post('/api/integrations/ci-cd/gate-check', async (request, reply) => {
    const auth = await validateApiKey(request, ApiKeyScope.CI_CD);
    if (!auth.valid) {
      const status = auth.code === 'INSUFFICIENT_SCOPE' ? 403 : 401;
      return reply.status(status).send({ error: auth.error });
    }

    const body = gateCheckSchema.parse(request.body);

    if (auth.projectId && auth.projectId !== body.projectId) {
      return reply.status(403).send({ error: 'API key not authorized for this project' });
    }

    const severityOrder: Record<string, number> = {
      CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1,
    };
    const minLevel = severityOrder[body.minSeverity] || 4;

    const where: Record<string, unknown> = {
      projectId: body.projectId,
      falsePositive: false,
      status: { notIn: [FindingStatus.RESOLVED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK] },
    };

    if (body.scanId) {
      where.scanId = body.scanId;
    }

    const allFindings = await prisma.finding.findMany({
      where,
      select: { id: true, dedupHash: true, createdAt: true, severity: true, title: true },
      orderBy: { severity: 'desc' },
    });

    const findings = dedupeLatest(allFindings);

    const blockingFindings = findings.filter(
      (f) => severityOrder[f.severity] >= minLevel
    );

    const passed = blockingFindings.length === 0;

    const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const f of findings) {
      bySeverity[f.severity]++;
    }

    return {
      passed,
      reason: passed ? 'No blocking vulnerabilities found' : `${blockingFindings.length} blocking vulnerabilities found`,
      totalFindings: findings.length,
      blockingFindings: blockingFindings.length,
      bySeverity,
      minSeverity: body.minSeverity,
      topBlocking: blockingFindings.slice(0, 10),
    };
  });

  fastify.post('/api/integrations/gateway/dye-verify', async (request, reply) => {
    const auth = await validateApiKey(request, ApiKeyScope.GATEWAY);
    if (!auth.valid) {
      const status = auth.code === 'INSUFFICIENT_SCOPE' ? 403 : 401;
      return reply.status(status).send({ error: auth.error });
    }

    const body = z.object({
      headers: z.record(z.string()),
      clientIp: z.string(),
      path: z.string().optional(),
      method: z.string().optional(),
    }).parse(request.body);

    const defaultRule = await prisma.dyeRule.findFirst({
      where: { enabled: true },
      include: { whitelistEntries: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultRule) {
      return {
        isSimulated: false,
        reason: 'No active dye rule configured',
        action: 'PASS_THROUGH',
      };
    }

    const simHeader = body.headers[defaultRule.headerSimulation.toLowerCase()] || body.headers[defaultRule.headerSimulation];
    const signHeader = body.headers[defaultRule.headerSign.toLowerCase()] || body.headers[defaultRule.headerSign];
    const tsHeader = body.headers[defaultRule.headerTimestamp.toLowerCase()] || body.headers[defaultRule.headerTimestamp];

    if (!simHeader || simHeader !== 'True') {
      return {
        isSimulated: false,
        reason: 'Missing simulation header',
        action: 'PASS_THROUGH',
      };
    }

    const whitelistIps = defaultRule.whitelistEntries.map((e: any) => e.ip);
    if (!whitelistIps.includes(body.clientIp)) {
      await prisma.dyeLog.create({
        data: {
          ruleId: defaultRule.id,
          action: 'VERIFY',
          result: 'FAILED',
          clientIp: body.clientIp,
          reason: 'IP not in whitelist',
          metadata: { path: body.path, method: body.method },
        },
      });

      return {
        isSimulated: false,
        reason: 'Client IP not in whitelist',
        action: 'BLOCK',
        details: { ip: body.clientIp, whitelistCount: whitelistIps.length },
      };
    }

    if (!signHeader || !tsHeader) {
      return {
        isSimulated: false,
        reason: 'Missing signature or timestamp header',
        action: 'BLOCK',
      };
    }

    const timestamp = parseInt(tsHeader, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > defaultRule.timeWindowSeconds) {
      await prisma.dyeLog.create({
        data: {
          ruleId: defaultRule.id,
          action: 'VERIFY',
          result: 'FAILED',
          clientIp: body.clientIp,
          reason: 'Timestamp outside time window',
          metadata: { timestamp, now, timeWindow: defaultRule.timeWindowSeconds },
        },
      });

      return {
        isSimulated: false,
        reason: 'Timestamp outside allowed time window (possible replay attack)',
        action: 'BLOCK',
      };
    }

    const crypto = await import('node:crypto');
    const expectedSign = crypto
      .createHmac('sha256', defaultRule.salt)
      .update(tsHeader)
      .digest('hex');

    if (signHeader !== expectedSign) {
      await prisma.dyeLog.create({
        data: {
          ruleId: defaultRule.id,
          action: 'VERIFY',
          result: 'FAILED',
          clientIp: body.clientIp,
          reason: 'HMAC signature mismatch',
          metadata: { providedSign: signHeader.slice(0, 16), expectedSign: expectedSign.slice(0, 16) },
        },
      });

      return {
        isSimulated: false,
        reason: 'HMAC signature verification failed',
        action: 'BLOCK',
      };
    }

    await prisma.dyeLog.create({
      data: {
        ruleId: defaultRule.id,
        action: 'VERIFY',
        result: 'SUCCESS',
        clientIp: body.clientIp,
        metadata: { path: body.path, method: body.method },
      },
    });

    return {
      isSimulated: true,
      action: 'SANDBOX_ROUTE',
      shadowConfig: {
        redisPrefix: defaultRule.shadowRedisPrefix,
        mqSuffix: defaultRule.shadowMqSuffix,
      },
      traceId: body.headers[defaultRule.headerTraceId.toLowerCase()] || body.headers[defaultRule.headerTraceId] || null,
    };
  });

  fastify.post('/api/integrations/ci-cd/bypass-verify', async (request, reply) => {
    const auth = await validateApiKey(request, ApiKeyScope.CI_CD);
    if (!auth.valid) {
      const status = auth.code === 'INSUFFICIENT_SCOPE' ? 403 : 401;
      return reply.status(status).send({ error: auth.error });
    }

    const body = z.object({
      projectId: z.string(),
      token: z.string(),
    }).parse(request.body);

    if (auth.projectId && auth.projectId !== body.projectId) {
      return reply.status(403).send({ error: 'API key not authorized for this project' });
    }

    const candidates = await prisma.bypassRequest.findMany({
      where: {
        projectId: body.projectId,
        status: BypassStatus.APPROVED,
        tokenHash: { not: null },
        expiresAt: { gt: new Date() },
      },
      include: { project: { select: { id: true, name: true } } },
    });

    const bypass = candidates.find((b) => b.tokenHash && verifyToken(body.token, b.tokenHash));

    if (!bypass) {
      return { valid: false, reason: 'invalid_token' };
    }

    if (bypass.status !== 'APPROVED') {
      return { valid: false, reason: 'not_approved' };
    }

    if (new Date(bypass.expiresAt) < new Date()) {
      return { valid: false, reason: 'expired' };
    }

    return {
      valid: true,
      bypassId: bypass.id,
      severity: bypass.severity,
      expiresAt: bypass.expiresAt,
      reason: bypass.reason,
    };
  });
};

export default scannerIntegrationRoutes;
