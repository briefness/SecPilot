import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

export interface JwtPayload {
  userId: string;
  email?: string;
  role?: string;
  name?: string;
  mfaPending?: boolean;
  mfaSetup?: boolean;
  mfaSecret?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  if (!fastify.hasRequestDecorator('user')) {
    fastify.decorateRequest('user', null);
  }

  fastify.addHook('onRequest', async (request, reply) => {
    const publicRoutes = [
      { method: 'POST', url: '/api/auth/login' },
      { method: 'GET', url: '/api/health' },
    ];

    const isPublic = publicRoutes.some(
      (route) => request.method === route.method && request.url === route.url
    );

    if (isPublic) {
      return;
    }

    if (request.url.startsWith('/api/integrations/')) {
      return;
    }

    try {
      const cookieHeader = request.headers.cookie || '';
      const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const decoded = fastify.jwt.verify<JwtPayload>(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, name: true, mfaEnabled: true },
      });

      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }

      request.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      };
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
};

export default fp(authPlugin, { name: 'auth-plugin' });
