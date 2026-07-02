import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ApiKeyScope, UserRole } from '@prisma/client';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.nativeEnum(ApiKeyScope),
  projectId: z.string().optional(),
  expiresAt: z.coerce.date().optional(),
});

const keyQuerySchema = z.object({
  projectId: z.string().optional(),
  scope: z.nativeEnum(ApiKeyScope).optional(),
});

function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString('hex');
  const prefix = `secp_${raw.slice(0, 8)}`;
  const key = `${prefix}${raw.slice(8)}`;
  const hash = createHash('sha256').update(key).digest('hex');
  return { key, hash, prefix };
}

const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/api-keys', async (request) => {
    const query = keyQuerySchema.parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.scope) where.scope = query.scope;

    const keys = await prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, productId: true },
        },
      },
    });

    return keys;
  });

  fastify.post('/api/api-keys', async (request, reply) => {
    const body = createKeySchema.parse(request.body);

    if (request.user.role === UserRole.DEVELOPER && body.scope === ApiKeyScope.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { key, hash, prefix } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        name: body.name,
        keyHash: hash,
        keyPrefix: prefix,
        scope: body.scope,
        projectId: body.projectId,
        expiresAt: body.expiresAt,
        createdBy: request.user.userId,
      },
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'api_key.create',
        userId: request.user.userId,
        projectId: body.projectId,
        metadata: { keyId: apiKey.id, name: body.name, scope: body.scope },
      },
    });

    return reply.status(201).send({
      ...apiKey,
      rawKey: key,
    });
  });

  fastify.delete('/api/api-keys/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const key = await prisma.apiKey.findUnique({ where: { id } });
    if (!key) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    if (request.user.role !== UserRole.ADMIN && key.createdBy !== request.user.userId) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    await prisma.apiKey.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'api_key.revoke',
        userId: request.user.userId,
        projectId: key.projectId,
        metadata: { keyId: id, keyName: key.name },
      },
    });

    return reply.status(204).send();
  });
};

export default apiKeyRoutes;
