import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { UserRole } from '@prisma/client';

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(UserRole).default(UserRole.DEVELOPER),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  password: z.string().min(8).max(128).optional(),
  mfaEnabled: z.boolean().optional(),
});

const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(UserRole).optional(),
  search: z.string().optional(),
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/users', async (request) => {
    const query = userQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.pageSize;

    const where: Record<string, unknown> = {};
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mfaEnabled: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  });

  fastify.get('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return user;
  });

  fastify.post('/api/users', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = createUserSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ error: 'User with this email already exists' });
    }

    const passwordHash = hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        role: body.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'user.create',
        userId: request.user.userId,
        metadata: {
          targetUserId: user.id,
          email: body.email,
          role: body.role,
        },
      },
    });

    return reply.status(201).send(user);
  });

  fastify.put('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const isSelf = request.user.userId === id;
    const isAdmin = request.user.role === UserRole.ADMIN;
    if (!isSelf && !isAdmin) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    if (body.role && !isAdmin) {
      return reply.status(403).send({ error: 'Only admins can change roles' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.mfaEnabled !== undefined) updateData.mfaEnabled = body.mfaEnabled;
    if (body.password) {
      updateData.passwordHash = hashPassword(body.password);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'user.update',
        userId: request.user.userId,
        metadata: {
          targetUserId: id,
          changes: Object.keys(updateData),
        },
      },
    });

    return updated;
  });

  fastify.delete('/api/users/:id', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };

    if (request.user.userId === id) {
      return reply.status(400).send({ error: 'Cannot delete your own account' });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    await prisma.user.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'user.delete',
        userId: request.user.userId,
        metadata: {
          targetUserId: id,
          email: user.email,
        },
      },
    });

    return { success: true };
  });

  fastify.get('/api/users/stats/summary', async () => {
    const [total, admin, developer, auditor, viewer] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: UserRole.ADMIN } }),
      prisma.user.count({ where: { role: UserRole.DEVELOPER } }),
      prisma.user.count({ where: { role: UserRole.AUDITOR } }),
      prisma.user.count({ where: { role: UserRole.VIEWER } }),
    ]);

    return {
      total,
      byRole: {
        ADMIN: admin,
        DEVELOPER: developer,
        AUDITOR: auditor,
        VIEWER: viewer,
      },
    };
  });
};

export default userRoutes;
