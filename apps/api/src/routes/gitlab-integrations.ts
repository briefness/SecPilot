import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { UserRole } from '@prisma/client';
import { GitlabGroupClient } from '../lib/gitlab-group.js';
import { encryptIfNeeded, decryptIfNeeded, secureCompare, hashToken, verifyToken } from '../lib/encryption.js';

function maskSensitive<T extends { webhookToken: string | null; securityBypassToken: string | null }>(i: T): T {
  return {
    ...i,
    webhookToken: i.webhookToken ? '********' : null as any,
    securityBypassToken: i.securityBypassToken ? '********' : null as any,
  };
}

function decryptAccessToken(token: string | null | undefined): string | null {
  return decryptIfNeeded(token) ?? token ?? null;
}

const createIntegrationSchema = z.object({
  projectId: z.string(),
  groupPath: z.string().min(1).max(200),
  projectPath: z.string().min(1).max(200),
  webhookToken: z.string().min(8).max(100),
  complianceTemplateEnabled: z.boolean().default(false),
  securityBypassToken: z.string().optional(),
});

const updateIntegrationSchema = z.object({
  groupPath: z.string().min(1).max(200).optional(),
  projectPath: z.string().min(1).max(200).optional(),
  webhookToken: z.string().min(8).max(100).optional(),
  complianceTemplateEnabled: z.boolean().optional(),
  securityBypassToken: z.string().nullable().optional(),
  lastSyncAt: z.coerce.date().nullable().optional(),
  syncStatus: z.string().nullable().optional(),
});

const webhookPayloadSchema = z.object({
  object_kind: z.string(),
  project: z.object({
    id: z.number(),
    path_with_namespace: z.string(),
    web_url: z.string(),
  }),
  builds: z.array(z.unknown()).optional(),
  commit: z.object({
    id: z.string(),
    message: z.string(),
  }).optional(),
  user: z.object({
    id: z.number(),
    name: z.string(),
    username: z.string(),
  }).optional(),
});

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

const gitlabIntegrationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/gitlab-integrations', async (request) => {
    const query = z.object({
      projectId: z.string().optional(),
    }).parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;

    const integrations = await prisma.gitlabIntegration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, productId: true, gitRepo: true },
        },
      },
    });

    return integrations.map(maskSensitive);
  });

  fastify.get('/api/gitlab-integrations/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.gitlabIntegration.findUnique({
      where: { projectId },
      include: {
        project: {
          select: { id: true, name: true, productId: true, gitRepo: true, type: true },
        },
      },
    });

    if (!integration) {
      return reply.status(404).send({ error: 'GitLab integration not found' });
    }

    return maskSensitive(integration);
  });

  fastify.post('/api/gitlab-integrations', async (request, reply) => {
    const body = createIntegrationSchema.parse(request.body);

    const existing = await prisma.gitlabIntegration.findUnique({
      where: { projectId: body.projectId },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Integration already exists for this project' });
    }

    const integration = await prisma.gitlabIntegration.create({
      data: {
        ...body,
        webhookToken: hashToken(body.webhookToken),
        securityBypassToken: encryptIfNeeded(body.securityBypassToken),
      },
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_integration.create',
        userId: request.user.userId,
        projectId: body.projectId,
        metadata: {
          integrationId: integration.id,
          groupPath: body.groupPath,
          projectPath: body.projectPath,
          complianceTemplateEnabled: body.complianceTemplateEnabled,
        },
      },
    });

    return reply.status(201).send(maskSensitive(integration));
  });

  fastify.patch('/api/gitlab-integrations/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = updateIntegrationSchema.parse(request.body);

    const integration = await prisma.gitlabIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitLab integration not found' });
    }

    const updateData: any = { ...body };
    if (body.webhookToken !== undefined) updateData.webhookToken = hashToken(body.webhookToken);
    if (body.securityBypassToken !== undefined) updateData.securityBypassToken = encryptIfNeeded(body.securityBypassToken);

    const updated = await prisma.gitlabIntegration.update({
      where: { projectId },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_integration.update',
        userId: request.user.userId,
        projectId,
        metadata: { changes: Object.keys(body) },
      },
    });

    return maskSensitive(updated);
  });

  fastify.delete('/api/gitlab-integrations/:projectId', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.gitlabIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitLab integration not found' });
    }

    await prisma.gitlabIntegration.delete({ where: { projectId } });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_integration.delete',
        userId: request.user.userId,
        projectId,
        metadata: { integrationId: integration.id },
      },
    });

    return reply.status(204).send();
  });

  fastify.post('/api/gitlab-integrations/:projectId/rotate-webhook-token', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.gitlabIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitLab integration not found' });
    }

    const newToken = generateToken();

    await prisma.gitlabIntegration.update({
      where: { projectId },
      data: { webhookToken: hashToken(newToken) },
    });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_integration.rotate_token',
        userId: request.user.userId,
        projectId,
        metadata: { integrationId: integration.id },
      },
    });

    return { webhookToken: newToken };
  });

  fastify.post('/api/gitlab-integrations/:projectId/rotate-bypass-token', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.gitlabIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitLab integration not found' });
    }

    const newToken = generateToken();

    await prisma.gitlabIntegration.update({
      where: { projectId },
      data: { securityBypassToken: encryptIfNeeded(newToken) },
    });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_integration.rotate_bypass_token',
        userId: request.user.userId,
        projectId,
        metadata: { integrationId: integration.id },
      },
    });

    return { securityBypassToken: newToken };
  });

  fastify.post('/api/gitlab-integrations/webhook', async (request, reply) => {
    const token = request.headers['x-gitlab-token'] as string;

    if (!token) {
      return reply.status(401).send({ error: 'Missing webhook token' });
    }

    let payload;
    try {
      payload = webhookPayloadSchema.parse(request.body);
    } catch {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }

    const projectPath = payload.project?.path_with_namespace;
    if (!projectPath) {
      return reply.status(400).send({ error: 'Missing project path in payload' });
    }

    const integration = await prisma.gitlabIntegration.findFirst({
      where: { projectPath },
      include: { project: true },
    });

    if (!integration) {
      return reply.status(404).send({ error: 'No matching integration' });
    }

    if (!integration.webhookToken) {
      return reply.status(403).send({ error: 'Webhook not configured' });
    }

    const tokenValid = integration.webhookToken.includes(':')
      ? verifyToken(token, integration.webhookToken)
      : secureCompare(token, decryptIfNeeded(integration.webhookToken) ?? integration.webhookToken);

    if (!tokenValid) {
      return reply.status(403).send({ error: 'Invalid webhook token' });
    }

    await prisma.gitlabIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: 'received',
      },
    });

    if (payload.object_kind === 'pipeline') {
      await prisma.auditLog.create({
        data: {
          action: 'gitlab_webhook.pipeline',
          userId: 'system',
          projectId: integration.projectId,
          metadata: {
            projectPath: payload.project.path_with_namespace,
            commitId: payload.commit?.id,
            user: payload.user?.username,
          },
        },
      });
    }

    return { received: true, project: integration.project.name };
  });

  fastify.get('/api/gitlab-integrations/compliance/template', async () => {
    const template = `# SecPilot Security Compliance Pipeline Template
# This template is injected at group level and cannot be overridden by projects

variables:
  SECURITY_PRODUCT_ID: "\${CI_PROJECT_ID}"
  SECURITY_API_URL: "https://secpilot.example.com/api"
  DEFECTDOJO_URL: "https://defectdojo.example.com"

stages:
  - security-fast-scan
  - security-release-audit
  - security-report

# Stage A: Fast scan on every commit
security_sast_scan:
  stage: security-fast-scan
  script:
    - echo "Running SAST scan via SecPilot..."
    - curl -X POST "\${SECURITY_API_URL}/scans/trigger" 
      -H "Authorization: Bearer \${SECURITY_SCANNER_TOKEN}"
      -d '{"project_id":"\${SECURITY_PRODUCT_ID}","type":"STATIC_SAST","pipeline_stage":"DAY_FAST_SCAN"}'
  rules:
    - if: '\$CI_COMMIT_BRANCH'
      when: always
      allow_failure: true

security_sca_scan:
  stage: security-fast-scan
  script:
    - echo "Running SCA / dependency scan via SecPilot OSV-Scanner..."
    - curl -X POST "\${SECURITY_API_URL}/scans/trigger"
      -H "Authorization: Bearer \${SECURITY_SCANNER_TOKEN}"
      -d '{"project_id":"\${SECURITY_PRODUCT_ID}","type":"STATIC_SCA","pipeline_stage":"DAY_FAST_SCAN"}'
  rules:
    - if: '\$CI_COMMIT_BRANCH'
      when: always
      allow_failure: true

# Stage C: Release audit on tag / deploy
security_mobsf_audit:
  stage: security-release-audit
  script:
    - echo "Running MobSF static analysis via SecPilot..."
    - curl -X POST "\${SECURITY_API_URL}/app-releases"
      -H "Authorization: Bearer \${SECURITY_SCANNER_TOKEN}"
      -d '{"project_id":"\${SECURITY_PRODUCT_ID}","version":"\${CI_COMMIT_TAG}","platform":"android","pre_hardening_hash":"\${APP_HASH}"}'
  rules:
    - if: '\$CI_COMMIT_TAG'
      when: on_success
  allow_failure: false

# Bypass mechanism (requires SECURITY_BYPASS_TOKEN from group-level vars)
.security_bypass:
  rules:
    - if: '\$SECURITY_BYPASS_TOKEN'
      when: never
`;

    return { template };
  });

  fastify.get('/api/gitlab-group-integrations', async () => {
    const integrations = await prisma.gitlabGroupIntegration.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map((i) => ({
      ...i,
      accessToken: i.accessToken ? '********' : null,
    }));
  });

  fastify.post('/api/gitlab-group-integrations', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = z.object({
      groupPath: z.string().min(1).max(200),
      accessToken: z.string().optional(),
      gitlabUrl: z.string().optional(),
      complianceFrameworkName: z.string().default('SecPilot Security Compliance'),
      compliancePipelinePath: z.string().default('.gitlab/security-compliance.yml'),
      enforcementEnabled: z.boolean().default(false),
    }).parse(request.body);

    const existing = await prisma.gitlabGroupIntegration.findUnique({
      where: { groupPath: body.groupPath },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Group integration already exists' });
    }

    const integration = await prisma.gitlabGroupIntegration.create({
      data: {
        groupPath: body.groupPath,
        accessToken: encryptIfNeeded(body.accessToken),
        complianceFrameworkName: body.complianceFrameworkName,
        compliancePipelinePath: body.compliancePipelinePath,
        enforcementEnabled: body.enforcementEnabled,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_group_integration.create',
        userId: request.user.userId,
        metadata: { groupPath: body.groupPath },
      },
    });

    return reply.status(201).send({
      ...integration,
      accessToken: integration.accessToken ? '********' : null,
    });
  });

  fastify.patch('/api/gitlab-group-integrations/:id', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const body = z.object({
      accessToken: z.string().nullable().optional(),
      complianceFrameworkName: z.string().optional(),
      compliancePipelinePath: z.string().optional(),
      enforcementEnabled: z.boolean().optional(),
    }).parse(request.body);

    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }

    const updateData: any = { ...body };
    if (body.accessToken !== undefined) updateData.accessToken = encryptIfNeeded(body.accessToken);

    const updated = await prisma.gitlabGroupIntegration.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_group_integration.update',
        userId: request.user.userId,
        metadata: { groupPath: integration.groupPath, changes: Object.keys(body) },
      },
    });

    return {
      ...updated,
      accessToken: updated.accessToken ? '********' : null,
    };
  });

  fastify.delete('/api/gitlab-group-integrations/:id', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }

    await prisma.gitlabGroupIntegration.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'gitlab_group_integration.delete',
        userId: request.user.userId,
        metadata: { groupPath: integration.groupPath },
      },
    });

    return reply.status(204).send();
  });

  fastify.post('/api/gitlab-group-integrations/:id/test-connection', async (request, reply) => {
    const { id } = request.params as { id: string };
    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }
    if (!integration.accessToken) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GitlabGroupClient(integration.groupPath, decryptAccessToken(integration.accessToken) ?? "");
      const group = await client.getGroup();
      return { success: true, groupId: group.id, groupName: group.name };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/api/gitlab-group-integrations/:id/compliance-frameworks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }
    if (!integration.accessToken) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GitlabGroupClient(integration.groupPath, decryptAccessToken(integration.accessToken) ?? "");
      const frameworks = await client.listComplianceFrameworks();
      return { frameworks };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.post('/api/gitlab-group-integrations/:id/enable-compliance', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const body = z.object({
      gitlabUrl: z.string().optional(),
      frameworkProjectPath: z.string().optional(),
      applyToProjects: z.array(z.number()).optional(),
      applyToAll: z.boolean().default(false),
    }).parse(request.body);

    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }
    if (!integration.accessToken) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GitlabGroupClient(
        integration.groupPath,
        decryptAccessToken(integration.accessToken) ?? "",
        body.gitlabUrl
      );

      const compliancePipelineYml = `# SecPilot Security Compliance Pipeline
# Injected at group level via Compliance Framework. CANNOT be overridden by project.

variables:
  SECURITY_PRODUCT_ID: "\${CI_PROJECT_ID}"
  SECURITY_API_URL: "\${SECPILOT_API_URL}"

stages:
  - secpilot-fast-scan
  - secpilot-release-audit
  - secpilot-report

# ── Stage A: Fast scan on every commit / MR ──
secpilot_sast_scan:
  stage: secpilot-fast-scan
  image: curlimages/curl:latest
  script:
    - |
      if [ -n "$SECURITY_BYPASS_TOKEN" ]; then
        echo "⚠️  Security bypass token detected. Skipping SAST scan (audit logged)."
        exit 0
      fi
      RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$SECURITY_API_URL/scans/trigger" \
        -H "Authorization: Bearer $SECPILOT_SCANNER_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"project_id\":\"$SECURITY_PRODUCT_ID\",\"type\":\"STATIC_SAST\",\"pipeline_stage\":\"DAY_FAST_SCAN\",\"ref\":\"$CI_COMMIT_REF_NAME\",\"commit\":\"$CI_COMMIT_SHA\"}")
      echo "$RESP"
      HTTP_CODE=$(echo "$RESP" | tail -1 | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)
      if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        echo "::error::Security scan trigger failed (HTTP $HTTP_CODE)"
        exit 1
      fi
  rules:
    - if: '$CI_COMMIT_BRANCH || $CI_MERGE_REQUEST_IID'
      when: always
  allow_failure: false

secpilot_sca_scan:
  stage: secpilot-fast-scan
  image: curlimages/curl:latest
  script:
    - |
      if [ -n "$SECURITY_BYPASS_TOKEN" ]; then
        echo "⚠️  Security bypass token detected. Skipping SCA scan (audit logged)."
        exit 0
      fi
      RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$SECURITY_API_URL/scans/trigger" \
        -H "Authorization: Bearer $SECPILOT_SCANNER_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"project_id\":\"$SECURITY_PRODUCT_ID\",\"type\":\"STATIC_SCA\",\"pipeline_stage\":\"DAY_FAST_SCAN\",\"ref\":\"$CI_COMMIT_REF_NAME\",\"commit\":\"$CI_COMMIT_SHA\"}")
      echo "$RESP"
      HTTP_CODE=$(echo "$RESP" | tail -1 | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)
      if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        echo "::error::SCA scan trigger failed (HTTP $HTTP_CODE)"
        exit 1
      fi
  rules:
    - if: '$CI_COMMIT_BRANCH || $CI_MERGE_REQUEST_IID'
      when: always
  allow_failure: false

# ── Stage C: Release audit on tag / deploy ──
secpilot_release_audit:
  stage: secpilot-release-audit
  image: curlimages/curl:latest
  script:
    - |
      if [ -n "$SECURITY_BYPASS_TOKEN" ]; then
        echo "⚠️  Security bypass token detected. Skipping release audit (audit logged)."
        exit 0
      fi
      RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$SECURITY_API_URL/app-releases" \
        -H "Authorization: Bearer $SECPILOT_SCANNER_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"project_id\":\"$SECURITY_PRODUCT_ID\",\"version\":\"$CI_COMMIT_TAG\",\"platform\":\"android\",\"pre_hardening_hash\":\"$APP_HASH\",\"ref\":\"$CI_COMMIT_REF_NAME\"}")
      echo "$RESP"
      HTTP_CODE=$(echo "$RESP" | tail -1 | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)
      if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        echo "::error::Release audit failed (HTTP $HTTP_CODE)"
        exit 1
      fi
  rules:
    - if: '$CI_COMMIT_TAG'
      when: on_success
  allow_failure: false

# ── Security gate: fail pipeline on critical/high findings ──
secpilot_gate_check:
  stage: secpilot-report
  image: curlimages/curl:latest
  script:
    - |
      if [ -n "$SECURITY_BYPASS_TOKEN" ]; then
        echo "⚠️  Security bypass token detected. Gate check skipped (audit logged)."
        exit 0
      fi
      RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$SECURITY_API_URL/scans/gate-check" \
        -H "Authorization: Bearer $SECPILOT_SCANNER_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"project_id\":\"$SECURITY_PRODUCT_ID\",\"branch\":\"$CI_COMMIT_REF_NAME\",\"commit_hash\":\"$CI_COMMIT_SHA\"}")
      echo "$RESP"
      HTTP_CODE=$(echo "$RESP" | tail -1 | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)
      if [ "$HTTP_CODE" != "200" ]; then
        echo "::error::Security gate check failed (HTTP $HTTP_CODE)"
        exit 1
      fi
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH || $CI_MERGE_REQUEST_IID'
      when: on_success
  allow_failure: false
`;

      const pipelineRef = body.frameworkProjectPath
        ? `${body.frameworkProjectPath}:${integration.compliancePipelinePath}@main`
        : `${integration.groupPath}/.gitlab/security-compliance.yml@main`;

      const framework = await client.createComplianceFramework({
        name: integration.complianceFrameworkName,
        description: 'SecPilot security compliance framework. All projects must pass security scans before merge.',
        color: '#6699cc',
        pipelineConfigurationFullPath: pipelineRef,
      });

      if (body.frameworkProjectPath) {
        await client.createPipelineFile({
          projectId: body.frameworkProjectPath,
          path: integration.compliancePipelinePath,
          content: compliancePipelineYml,
          branch: 'main',
          commitMessage: 'feat: add SecPilot security compliance pipeline',
        });
      }

      let assignedCount = 0;
      if (body.applyToAll) {
        const projects = await client.listGroupProjects({ perPage: 100, page: 1 });
        for (const project of projects) {
          try {
            await client.assignProjectComplianceFramework(project.id, String(framework.id));
            assignedCount++;
          } catch {
          }
        }
      } else if (body.applyToProjects && body.applyToProjects.length > 0) {
        for (const projectId of body.applyToProjects) {
          try {
            await client.assignProjectComplianceFramework(projectId, String(framework.id));
            assignedCount++;
          } catch {
          }
        }
      }

      await prisma.gitlabGroupIntegration.update({
        where: { id },
        data: {
          complianceFrameworkId: framework.id,
          enforcementEnabled: true,
          syncStatus: 'active',
          lastSyncAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'gitlab_group_integration.compliance_enabled',
          userId: request.user.userId,
          metadata: {
            groupPath: integration.groupPath,
            frameworkId: framework.id,
            assignedCount,
            applyToAll: body.applyToAll,
          },
        },
      });

      return reply.status(201).send({
        success: true,
        framework,
        assignedCount,
        pipelineRef,
      });
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.post('/api/gitlab-group-integrations/:id/disable-compliance', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const body = z.object({
      gitlabUrl: z.string().optional(),
      deleteFramework: z.boolean().default(false),
    }).parse(request.body);

    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }
    if (!integration.accessToken) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GitlabGroupClient(
        integration.groupPath,
        decryptAccessToken(integration.accessToken) ?? "",
        body.gitlabUrl
      );

      if (body.deleteFramework && integration.complianceFrameworkId) {
        await client.deleteComplianceFramework(String(integration.complianceFrameworkId));
      }

      await prisma.gitlabGroupIntegration.update({
        where: { id },
        data: {
          enforcementEnabled: false,
          syncStatus: 'disabled',
          lastSyncAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'gitlab_group_integration.compliance_disabled',
          userId: request.user.userId,
          metadata: {
            groupPath: integration.groupPath,
            deleteFramework: body.deleteFramework,
          },
        },
      });

      return { success: true };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/api/gitlab-group-integrations/:id/projects', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = z.object({
      page: z.coerce.number().default(1),
      perPage: z.coerce.number().default(30),
      search: z.string().optional(),
    }).parse(request.query);

    const integration = await prisma.gitlabGroupIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Group integration not found' });
    }
    if (!integration.accessToken) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GitlabGroupClient(integration.groupPath, decryptAccessToken(integration.accessToken) ?? "");
      const projects = await client.listGroupProjects({
        page: query.page,
        perPage: query.perPage,
        search: query.search,
      });

      return {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          path_with_namespace: p.path_with_namespace,
        })),
        page: query.page,
        perPage: query.perPage,
        total: projects.length,
      };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default gitlabIntegrationRoutes;
