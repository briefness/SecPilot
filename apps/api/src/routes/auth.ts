import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { generateTOTPSecret, verifyTOTP, generateOTPAuthURL, qrCodeDataURL } from '../lib/totp.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaVerifySchema = z.object({
  tempToken: z.string(),
  code: z.string().length(6),
});

const mfaEnableSchema = z.object({
  code: z.string().length(6),
});

const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().length(6),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const passwordHash = createHash('sha256').update(body.password).digest('hex');
    if (user.passwordHash !== passwordHash) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (user.mfaEnabled && user.mfaSecret) {
      const tempToken = fastify.jwt.sign(
        {
          userId: user.id,
          mfaPending: true,
        },
        { expiresIn: '5m' }
      );

      await prisma.auditLog.create({
        data: {
          action: 'user.login_mfa_pending',
          userId: user.id,
          metadata: { ip: request.ip },
        },
      });

      return reply.status(202).send({
        mfaRequired: true,
        tempToken,
      });
    }

    const token = fastify.jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      { expiresIn: '24h' }
    );

    await prisma.auditLog.create({
      data: {
        action: 'user.login',
        userId: user.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
      },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
      },
    };
  });

  fastify.post('/api/auth/mfa/verify', async (request, reply) => {
    const body = mfaVerifySchema.parse(request.body);

    let decoded: any;
    try {
      decoded = fastify.jwt.verify(body.tempToken);
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired temp token' });
    }

    if (!decoded.mfaPending) {
      return reply.status(400).send({ error: 'MFA not pending' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.mfaSecret) {
      return reply.status(400).send({ error: 'MFA not enabled' });
    }

    if (!verifyTOTP(body.code, user.mfaSecret)) {
      await prisma.auditLog.create({
        data: {
          action: 'user.login_mfa_failed',
          userId: user.id,
          metadata: { ip: request.ip },
        },
      });
      return reply.status(401).send({ error: 'Invalid MFA code' });
    }

    const token = fastify.jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      { expiresIn: '24h' }
    );

    await prisma.auditLog.create({
      data: {
        action: 'user.login',
        userId: user.id,
        metadata: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          mfa: true,
        },
      },
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
      },
    };
  });

  fastify.get('/api/auth/mfa/setup', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.mfaEnabled) {
      return { alreadyEnabled: true };
    }

    const secret = generateTOTPSecret();
    const otpAuthURL = generateOTPAuthURL(secret, user.email, 'SecPilot');
    const qrCode = qrCodeDataURL(otpAuthURL);

    const setupToken = fastify.jwt.sign(
      {
        userId: user.id,
        mfaSecret: secret,
        mfaSetup: true,
      },
      { expiresIn: '10m' }
    );

    return {
      secret,
      otpAuthURL,
      qrCodeUrl: qrCode,
      setupToken,
    };
  });

  fastify.post('/api/auth/mfa/enable', async (request, reply) => {
    const body = mfaEnableSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (user.mfaEnabled) {
      return reply.status(400).send({ error: 'MFA already enabled' });
    }

    const authHeader = request.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return reply.status(400).send({ error: 'Setup token required. Call /mfa/setup first.' });
    }

    let decoded: any;
    try {
      decoded = fastify.jwt.verify(token);
    } catch {
      return reply.status(400).send({ error: 'Invalid or expired setup session' });
    }

    if (!decoded.mfaSetup || !decoded.mfaSecret) {
      return reply.status(400).send({ error: 'Setup not initiated' });
    }

    if (!verifyTOTP(body.code, decoded.mfaSecret)) {
      return reply.status(400).send({ error: 'Invalid MFA code' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecret: decoded.mfaSecret,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'user.mfa_enabled',
        userId: user.id,
        metadata: { ip: request.ip },
      },
    });

    return { success: true, mfaEnabled: true };
  });

  fastify.post('/api/auth/mfa/disable', async (request, reply) => {
    const body = mfaDisableSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return reply.status(400).send({ error: 'MFA not enabled' });
    }

    const passwordHash = createHash('sha256').update(body.password).digest('hex');
    if (user.passwordHash !== passwordHash) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    if (!verifyTOTP(body.code, user.mfaSecret)) {
      return reply.status(400).send({ error: 'Invalid MFA code' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'user.mfa_disabled',
        userId: user.id,
        metadata: { ip: request.ip },
      },
    });

    return { success: true, mfaEnabled: false };
  });

  fastify.get('/api/auth/mfa/status', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { mfaEnabled: true },
    });

    return { mfaEnabled: user?.mfaEnabled ?? false };
  });

  fastify.get('/api/auth/me', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });

    return { user };
  });

  fastify.post('/api/auth/logout', async (request) => {
    await prisma.auditLog.create({
      data: {
        action: 'user.logout',
        userId: request.user.userId,
        metadata: {
          ip: request.ip,
        },
      },
    });

    return { success: true };
  });
};

export default authRoutes;
