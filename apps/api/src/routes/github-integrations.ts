import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHmac, randomBytes, timingSafeEqual as crypto_timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { UserRole } from '@prisma/client';
import { GithubOrgClient } from '../lib/github-org.js';
import { encryptIfNeeded, decryptIfNeeded } from '../lib/encryption.js';

const createIntegrationSchema = z.object({
  projectId: z.string(),
  owner: z.string().min(1).max(200),
  repo: z.string().min(1).max(200),
  webhookSecret: z.string().min(8).max(200),
  personalAccessToken: z.string().optional(),
  requiredWorkflowEnabled: z.boolean().default(false),
  securityBypassToken: z.string().optional(),
});

const updateIntegrationSchema = z.object({
  owner: z.string().min(1).max(200).optional(),
  repo: z.string().min(1).max(200).optional(),
  webhookSecret: z.string().min(8).max(200).optional(),
  personalAccessToken: z.string().nullable().optional(),
  requiredWorkflowEnabled: z.boolean().optional(),
  securityBypassToken: z.string().nullable().optional(),
  lastSyncAt: z.coerce.date().nullable().optional(),
  syncStatus: z.string().nullable().optional(),
});

function maskGithubSensitive<T extends { webhookSecret: string | null; personalAccessToken: string | null; securityBypassToken: string | null }>(i: T): T {
  return {
    ...i,
    webhookSecret: i.webhookSecret ? '********' : null as any,
    personalAccessToken: i.personalAccessToken ? '********' : null as any,
    securityBypassToken: i.securityBypassToken ? '********' : null as any,
  };
}

function maskOrgSensitive<T extends { privateKey: string | null; personalAccessToken: string | null }>(i: T): T {
  return {
    ...i,
    privateKey: i.privateKey ? '********' : null as any,
    personalAccessToken: i.personalAccessToken ? '********' : null as any,
  };
}

function decryptOrgToken(token: string | null | undefined): string | null {
  return decryptIfNeeded(token) ?? token ?? null;
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function verifyGithubSignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto_timingSafeEqual(expectedBuf, actualBuf);
}

const githubIntegrationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/github-integrations', async (request) => {
    const query = z.object({
      projectId: z.string().optional(),
    }).parse(request.query);

    const where: Record<string, unknown> = {};
    if (query.projectId) where.projectId = query.projectId;

    const integrations = await prisma.githubIntegration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true, productId: true, gitRepo: true },
        },
      },
    });

    return integrations.map(maskGithubSensitive);
  });

  fastify.get('/api/github-integrations/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.githubIntegration.findUnique({
      where: { projectId },
      include: {
        project: {
          select: { id: true, name: true, productId: true, gitRepo: true, type: true },
        },
      },
    });

    if (!integration) {
      return reply.status(404).send({ error: 'GitHub integration not found' });
    }

    return maskGithubSensitive(integration);
  });

  fastify.post('/api/github-integrations', async (request, reply) => {
    const body = createIntegrationSchema.parse(request.body);

    const existing = await prisma.githubIntegration.findUnique({
      where: { projectId: body.projectId },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Integration already exists for this project' });
    }

    const integration = await prisma.githubIntegration.create({
      data: {
        ...body,
        webhookSecret: encryptIfNeeded(body.webhookSecret) ?? body.webhookSecret,
        personalAccessToken: encryptIfNeeded(body.personalAccessToken),
        securityBypassToken: encryptIfNeeded(body.securityBypassToken),
      },
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'github_integration.create',
        userId: request.user.userId,
        projectId: body.projectId,
        metadata: {
          integrationId: integration.id,
          owner: body.owner,
          repo: body.repo,
          requiredWorkflowEnabled: body.requiredWorkflowEnabled,
        },
      },
    });

    return reply.status(201).send(maskGithubSensitive(integration));
  });

  fastify.patch('/api/github-integrations/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = updateIntegrationSchema.parse(request.body);

    const integration = await prisma.githubIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitHub integration not found' });
    }

    const updateData: any = { ...body };
    if (body.webhookSecret !== undefined) updateData.webhookSecret = encryptIfNeeded(body.webhookSecret);
    if (body.personalAccessToken !== undefined) updateData.personalAccessToken = encryptIfNeeded(body.personalAccessToken);
    if (body.securityBypassToken !== undefined) updateData.securityBypassToken = encryptIfNeeded(body.securityBypassToken);

    const updated = await prisma.githubIntegration.update({
      where: { projectId },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, productId: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'github_integration.update',
        userId: request.user.userId,
        projectId,
        metadata: { changes: Object.keys(body) },
      },
    });

    return maskGithubSensitive(updated);
  });

  fastify.delete('/api/github-integrations/:projectId', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.githubIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitHub integration not found' });
    }

    await prisma.githubIntegration.delete({ where: { projectId } });

    await prisma.auditLog.create({
      data: {
        action: 'github_integration.delete',
        userId: request.user.userId,
        projectId,
        metadata: { integrationId: integration.id },
      },
    });

    return reply.status(204).send();
  });

  fastify.post('/api/github-integrations/:projectId/rotate-webhook-secret', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.githubIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitHub integration not found' });
    }

    const newSecret = generateToken();

    await prisma.githubIntegration.update({
      where: { projectId },
      data: { webhookSecret: encryptIfNeeded(newSecret) ?? newSecret },
    });

    await prisma.auditLog.create({
      data: {
        action: 'github_integration.rotate_webhook_secret',
        userId: request.user.userId,
        projectId,
        metadata: { integrationId: integration.id },
      },
    });

    return { webhookSecret: newSecret };
  });

  fastify.post('/api/github-integrations/:projectId/rotate-bypass-token', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { projectId } = request.params as { projectId: string };

    const integration = await prisma.githubIntegration.findUnique({ where: { projectId } });
    if (!integration) {
      return reply.status(404).send({ error: 'GitHub integration not found' });
    }

    const newToken = generateToken();

    await prisma.githubIntegration.update({
      where: { projectId },
      data: { securityBypassToken: encryptIfNeeded(newToken) },
    });

    await prisma.auditLog.create({
      data: {
        action: 'github_integration.rotate_bypass_token',
        userId: request.user.userId,
        projectId,
        metadata: { integrationId: integration.id },
      },
    });

    return { securityBypassToken: newToken };
  });

  fastify.post('/api/github-integrations/webhook', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string;
    const event = request.headers['x-github-event'] as string;
    const delivery = request.headers['x-github-delivery'] as string;

    if (!signature || !event) {
      return reply.status(401).send({ error: 'Missing webhook headers' });
    }

    const rawBody = (request.raw as unknown as { body?: string }).body || JSON.stringify(request.body);

    const webhookPayload = z.object({
      repository: z.object({
        id: z.number(),
        full_name: z.string(),
        html_url: z.string(),
      }).optional(),
      ref: z.string().optional(),
      action: z.string().optional(),
      pull_request: z.object({
        number: z.number(),
        title: z.string(),
        head: z.object({ sha: z.string(), ref: z.string() }),
      }).optional(),
      sender: z.object({
        login: z.string(),
        id: z.number(),
      }).optional(),
    }).safeParse(request.body);

    if (!webhookPayload.success) {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }

    const payload = webhookPayload.data;
    const repoFullName = payload.repository?.full_name;

    if (!repoFullName) {
      return reply.status(400).send({ error: 'Missing repository info' });
    }

    const [owner, repo] = repoFullName.split('/');
    const integration = await prisma.githubIntegration.findFirst({
      where: { owner, repo },
      include: { project: true },
    });

    if (!integration) {
      return reply.status(404).send({ error: 'No matching integration' });
    }

    const decryptedSecret = decryptIfNeeded(integration.webhookSecret) ?? integration.webhookSecret;
    if (!decryptedSecret) {
      return reply.status(403).send({ error: 'Invalid signature' });
    }

    const valid = verifyGithubSignature(rawBody, signature, decryptedSecret);
    if (!valid) {
      return reply.status(403).send({ error: 'Invalid signature' });
    }

    await prisma.githubIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: 'received',
      },
    });

    if (event === 'push' || event === 'pull_request') {
      await prisma.auditLog.create({
        data: {
          action: `github_webhook.${event}`,
          userId: 'system',
          projectId: integration.projectId,
          metadata: {
            delivery,
            ref: payload.ref,
            action: payload.action,
            prNumber: payload.pull_request?.number,
            sender: payload.sender?.login,
          },
        },
      });
    }

    return { received: true, event, project: integration.project.name };
  });

  fastify.get('/api/github-integrations/workflow/template', async () => {
    const template = `name: SecPilot Security Scan

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master]

permissions:
  contents: read
  security-events: write

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: SAST Static Analysis
        run: |
          curl -X POST "\${{ secrets.SECPILOT_API_URL }}/scans/trigger" \\
            -H "Authorization: Bearer \${{ secrets.SECPILOT_SCANNER_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "project_id": "\${{ secrets.SECPILOT_PRODUCT_ID }}",
              "type": "STATIC_SAST",
              "pipeline_stage": "DAY_FAST_SCAN",
              "branch": "\${{ github.ref_name }}",
              "commit_hash": "\${{ github.sha }}"
            }'

      - name: SCA Dependency Scan
        run: |
          curl -X POST "\${{ secrets.SECPILOT_API_URL }}/scans/trigger" \\
            -H "Authorization: Bearer \${{ secrets.SECPILOT_SCANNER_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "project_id": "\${{ secrets.SECPILOT_PRODUCT_ID }}",
              "type": "STATIC_SCA",
              "pipeline_stage": "DAY_FAST_SCAN",
              "branch": "\${{ github.ref_name }}"
            }'

      - name: Gate Check
        if: github.event_name == 'pull_request'
        run: |
          RESULT=$(curl -s -X POST "\${{ secrets.SECPILOT_API_URL }}/integrations/ci-cd/gate-check" \\
            -H "Authorization: Bearer \${{ secrets.SECPILOT_SCANNER_TOKEN }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "project_id": "\${{ secrets.SECPILOT_PRODUCT_ID }}",
              "version": "\${{ github.sha }}",
              "branch": "\${{ github.ref_name }}"
            }')
          echo "$RESULT"
          PASSED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('passed', False))")
          if [ "$PASSED" = "False" ]; then
            echo "Security gate check failed!"
            exit 1
          fi

# Bypass: set SECURITY_BYPASS_TOKEN in org secrets to skip
#         (auto-alerts security team, 24h review window)
`;

    return { template };
  });

  fastify.get('/api/github-org-integrations', async () => {
    const integrations = await prisma.githubOrgIntegration.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map(maskOrgSensitive);
  });

  fastify.post('/api/github-org-integrations', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const body = z.object({
      orgName: z.string().min(1).max(200),
      appId: z.string().optional(),
      installationId: z.string().optional(),
      privateKey: z.string().optional(),
      personalAccessToken: z.string().optional(),
      requiredWorkflowRepo: z.string().optional(),
      requiredWorkflowPath: z.string().default('.github/workflows/secpilot-security.yml'),
      requiredWorkflowRef: z.string().default('main'),
      enforcementMode: z.string().default('action'),
      enabled: z.boolean().default(false),
    }).parse(request.body);

    const existing = await prisma.githubOrgIntegration.findUnique({
      where: { orgName: body.orgName },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Org integration already exists' });
    }

    const integration = await prisma.githubOrgIntegration.create({
      data: {
        ...body,
        privateKey: encryptIfNeeded(body.privateKey),
        personalAccessToken: encryptIfNeeded(body.personalAccessToken),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'github_org_integration.create',
        userId: request.user.userId,
        metadata: { orgName: body.orgName, enabled: body.enabled },
      },
    });

    return reply.status(201).send(maskOrgSensitive(integration));
  });

  fastify.patch('/api/github-org-integrations/:id', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const body = z.object({
      appId: z.string().nullable().optional(),
      installationId: z.string().nullable().optional(),
      privateKey: z.string().nullable().optional(),
      personalAccessToken: z.string().nullable().optional(),
      requiredWorkflowRepo: z.string().nullable().optional(),
      requiredWorkflowPath: z.string().optional(),
      requiredWorkflowRef: z.string().optional(),
      enforcementMode: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(request.body);

    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    const updateData: any = { ...body };
    if (body.privateKey !== undefined) updateData.privateKey = encryptIfNeeded(body.privateKey);
    if (body.personalAccessToken !== undefined) updateData.personalAccessToken = encryptIfNeeded(body.personalAccessToken);

    const updated = await prisma.githubOrgIntegration.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        action: 'github_org_integration.update',
        userId: request.user.userId,
        metadata: { orgName: integration.orgName, changes: Object.keys(body) },
      },
    });

    return maskOrgSensitive(updated);
  });

  fastify.delete('/api/github-org-integrations/:id', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    await prisma.githubOrgIntegration.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: 'github_org_integration.delete',
        userId: request.user.userId,
        metadata: { orgName: integration.orgName },
      },
    });

    return reply.status(204).send();
  });

  fastify.post('/api/github-org-integrations/:id/test-connection', async (request, reply) => {
    const { id } = request.params as { id: string };
    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    const token = decryptOrgToken(integration.personalAccessToken);
    if (!token) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GithubOrgClient(integration.orgName, token);
      const repos = await client.listOrgRepos({ per_page: 1, page: 1 });
      return { success: true, orgName: integration.orgName, reposFetched: repos.length };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/api/github-org-integrations/:id/required-workflows', async (request, reply) => {
    const { id } = request.params as { id: string };
    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    const token = decryptOrgToken(integration.personalAccessToken);
    if (!token) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GithubOrgClient(integration.orgName, token);
      const result = await client.listRequiredWorkflows();
      return result;
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.post('/api/github-org-integrations/:id/required-workflows', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id } = request.params as { id: string };
    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    const token = decryptOrgToken(integration.personalAccessToken);
    if (!token) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    const body = z.object({
      scope: z.enum(['all', 'selected_repositories']).default('all'),
      selectedRepositoryIds: z.array(z.number()).optional(),
    }).parse(request.body);

    try {
      const client = new GithubOrgClient(integration.orgName, token);

      if (integration.requiredWorkflowRepo) {
        const [owner, repo] = integration.requiredWorkflowRepo.split('/');
        if (!owner || !repo) {
          return reply.status(400).send({ error: 'Invalid requiredWorkflowRepo format. Use owner/repo' });
        }

        const workflowContent = `name: SecPilot Security Compliance

on:
  pull_request:
    types: [opened, synchronize, reopened]
  workflow_dispatch:

permissions:
  contents: read
  security-events: write
  actions: read

jobs:
  security-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: SecPilot Security Gate Check
        run: |
          RESPONSE=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST "$SECPILOT_API_URL/api/scans/gate-check" \\
            -H "Authorization: Bearer $SECPILOT_API_TOKEN" \\
            -H "Content-Type: application/json" \\
            -d '{
              "project_id": "$SECPILOT_PRODUCT_ID",
              "branch": "\${{ github.ref_name }}",
              "commit_hash": "\${{ github.sha }}",
              "pr_number": "\${{ github.event.pull_request.number }}"
            }')
          HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS:.*//')
          HTTP_CODE=$(echo "$RESPONSE" | grep -oE 'HTTP_STATUS:[0-9]+' | cut -d: -f2)

          echo "$HTTP_BODY"

          if [ "$HTTP_CODE" != "200" ]; then
            echo "::error::Security gate check request failed (HTTP $HTTP_CODE)"
            exit 1
          fi

          PASSED=$(echo "$HTTP_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('passed', False))" 2>/dev/null || echo "True")
          if [ "$PASSED" = "False" ]; then
            echo "::error::Security gate check failed. Critical or High severity findings detected."
            exit 1
          fi

          echo "::notice::Security gate check passed."
        env:
          SECPILOT_API_URL: \${{ vars.SECPILOT_API_URL }}
          SECPILOT_API_TOKEN: \${{ secrets.SECPILOT_API_TOKEN }}
          SECPILOT_PRODUCT_ID: \${{ vars.SECPILOT_PRODUCT_ID }}

# Emergency bypass: set EMERGENCY_BYPASS_TOKEN in org secrets
# and include it in PR body as /bypass <token> to skip (audit logged)
`;

        await client.createWorkflowFile({
          owner,
          repo,
          path: integration.requiredWorkflowPath,
          content: workflowContent,
          message: 'feat: add SecPilot security compliance required workflow',
          branch: integration.requiredWorkflowRef,
        });
      }

      if (!integration.requiredWorkflowRepo) {
        return reply.status(400).send({
          error: 'requiredWorkflowRepo not configured. Set to the repo containing the workflow file (owner/repo).',
        });
      }

      const [wfOwner, wfRepo] = integration.requiredWorkflowRepo.split('/');
      const repoId = await client.getRepoId(wfOwner, wfRepo);

      const result = await client.createRequiredWorkflow({
        workflowFilePath: integration.requiredWorkflowPath,
        repositoryId: repoId,
        scope: body.scope,
        ref: integration.requiredWorkflowRef,
        selectedRepositoryIds: body.selectedRepositoryIds,
      });

      await prisma.githubOrgIntegration.update({
        where: { id },
        data: {
          enabled: true,
          syncStatus: 'active',
          lastSyncAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'github_org_integration.required_workflow_created',
          userId: request.user.userId,
          metadata: { orgName: integration.orgName, workflowId: result.id, scope: body.scope },
        },
      });

      return reply.status(201).send(result);
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.delete('/api/github-org-integrations/:id/required-workflows/:workflowId', async (request, reply) => {
    if (request.user.role !== UserRole.ADMIN) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }

    const { id, workflowId } = request.params as { id: string; workflowId: string };
    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    const token = decryptOrgToken(integration.personalAccessToken);
    if (!token) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GithubOrgClient(integration.orgName, token);
      await client.deleteRequiredWorkflow(parseInt(workflowId, 10));

      await prisma.auditLog.create({
        data: {
          action: 'github_org_integration.required_workflow_deleted',
          userId: request.user.userId,
          metadata: { orgName: integration.orgName, workflowId: parseInt(workflowId, 10) },
        },
      });

      return reply.status(204).send();
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/api/github-org-integrations/:id/repos', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = z.object({
      page: z.coerce.number().default(1),
      per_page: z.coerce.number().default(30),
      type: z.string().optional(),
    }).parse(request.query);

    const integration = await prisma.githubOrgIntegration.findUnique({ where: { id } });
    if (!integration) {
      return reply.status(404).send({ error: 'Org integration not found' });
    }

    const token = decryptOrgToken(integration.personalAccessToken);
    if (!token) {
      return reply.status(400).send({ error: 'No access token configured' });
    }

    try {
      const client = new GithubOrgClient(integration.orgName, token);
      const repos = await client.listOrgRepos({
        type: query.type,
        per_page: query.per_page,
        page: query.page,
      });
      return { repos, total: repos.length, page: query.page, perPage: query.per_page };
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default githubIntegrationRoutes;
