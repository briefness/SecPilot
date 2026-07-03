import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { getScanQueue, getQueueStats } from './lib/queue.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import projectsRoutes from './routes/projects.js';
import scansRoutes from './routes/scans.js';
import findingsRoutes from './routes/findings.js';
import dashboardRoutes from './routes/dashboard.js';
import bypassRoutes from './routes/bypass.js';
import trafficDyeRoutes from './routes/traffic-dye.js';
import pipelineRoutes from './routes/pipeline.js';
import scannerRoutes from './routes/scanners.js';
import userRoutes from './routes/users.js';
import auditLogRoutes from './routes/audit-logs.js';
import systemConfigRoutes from './routes/system-config.js';
import reportsRoutes from './routes/reports.js';
import appReleaseRoutes from './routes/app-releases.js';
import pentestRoutes from './routes/pentests.js';
import gitlabIntegrationRoutes from './routes/gitlab-integrations.js';
import githubIntegrationRoutes from './routes/github-integrations.js';
import apiKeyRoutes from './routes/api-keys.js';
import integrationRoutes from './routes/integrations.js';
import projectScannerRoutes from './routes/project-scanners.js';
import { TrafficDye } from '@secops/traffic-dye';

async function buildServer() {
  const fastify = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  const trafficDye = new TrafficDye({
    salt: config.SECOPS_SALT,
    timeWindowSeconds: 300,
    ipWhitelist: [],
    shadowRedisPrefix: 'secops:shadow:',
    shadowMqSuffix: '-shadow',
  });

  fastify.decorate('trafficDye', trafficDye);

  await fastify.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: config.CORS_ORIGIN !== '*',
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  await fastify.register(authPlugin);

  fastify.get('/api/health', async () => {
    const dbStatus = await prisma.$queryRaw`SELECT 1 as health`.then(() => 'healthy').catch(() => 'unhealthy');
    let queueStatus = 'unknown';
    try {
      const queue = getScanQueue();
      await queue.getActiveCount();
      queueStatus = 'healthy';
    } catch {
      queueStatus = 'unhealthy';
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.NODE_ENV,
      services: {
        database: dbStatus,
        queue: queueStatus,
      },
    };
  });

  await fastify.register(authRoutes);
  await fastify.register(projectsRoutes);
  await fastify.register(scansRoutes);
  await fastify.register(findingsRoutes);
  await fastify.register(dashboardRoutes);
  await fastify.register(bypassRoutes);
  await fastify.register(trafficDyeRoutes);
  await fastify.register(pipelineRoutes);
  await fastify.register(scannerRoutes);
  await fastify.register(userRoutes);
  await fastify.register(auditLogRoutes);
  await fastify.register(systemConfigRoutes);
  await fastify.register(reportsRoutes);
  await fastify.register(appReleaseRoutes);
  await fastify.register(pentestRoutes);
  await fastify.register(gitlabIntegrationRoutes);
  await fastify.register(githubIntegrationRoutes);
  await fastify.register(apiKeyRoutes);
  await fastify.register(integrationRoutes);
  await fastify.register(projectScannerRoutes);

  fastify.get('/api/queue/stats', async () => {
    const stats = await getQueueStats();
    return stats;
  });

  fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      reply.status(400).send({
        error: 'Validation Error',
        details: error.validation,
      });
      return;
    }

    request.log.error(error);

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : error.message,
      ...(config.NODE_ENV === 'development' && statusCode === 500 ? { stack: error.stack } : {}),
    });
  });

  return fastify;
}

async function startServer() {
  try {
    const fastify = await buildServer();

    await fastify.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    console.log(`🚀 SecOps API server running on port ${config.PORT}`);
    console.log(`📍 Environment: ${config.NODE_ENV}`);
    console.log(`🔍 Health check: http://localhost:${config.PORT}/api/health`);

    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      try {
        await fastify.close();
        await prisma.$disconnect();
        console.log('Server shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  startServer();
}

export { buildServer, startServer };
