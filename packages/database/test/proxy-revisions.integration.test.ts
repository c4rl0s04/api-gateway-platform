import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  AdminRole,
  createApiProxy,
  createConfiguredApiProxy,
  deployProxyRevision,
  importProxyRevision,
  prisma,
  ProxyDeploymentError,
  ProxyBundleError,
} from '../src/index.js';

const integration = process.env.RUN_DATABASE_INTEGRATION === '1'
  ? describe
  : describe.skip;
const suffix = randomUUID();
const organizationId = `org-revision-test-${suffix}`;
const actor = {
  issuer: 'test://integration',
  subject: `revision-test-${suffix}`,
  role: AdminRole.platformAdmin,
};

function bundle(basePath: string, operationId: string) {
  return {
    openapiSource: JSON.stringify({
      openapi: '3.1.0',
      info: { title: operationId, version: '1.0.0' },
      paths: {
        '/resources/{id}': {
          get: {
            operationId,
            parameters: [{
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            }],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    }),
    gatewayConfigSource: JSON.stringify({
      apiVersion: 'gateway.platform/v1',
      basePath,
      defaults: { policies: [] },
      operations: {
        [operationId]: { targetPath: '/backend/{id}' },
      },
    }),
  };
}

integration('proxy revision persistence', () => {
  async function cleanup() {
    await prisma.apiProxy.deleteMany({ where: { organizationId } });
    await prisma.auditEvent.deleteMany({ where: { actorSubject: actor.subject } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }

  before(async () => {
    await cleanup();
    await prisma.organization.create({
      data: { id: organizationId, name: 'Revision integration tests' },
    });
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates a configured proxy and revision one atomically', async () => {
    const configured = await createConfiguredApiProxy({
      organizationId,
      name: 'Configured accounts',
      ...bundle(`/configured-test-${suffix}`, 'getConfigured'),
      actor,
    });
    assert.equal(configured.proxy.name, 'Configured accounts');
    assert.equal(configured.revision.revisionNumber, 1);
    assert.equal(configured.revision.operations.length, 1);
    assert.equal(
      await prisma.apiProxyRevision.count({
        where: { proxyId: configured.proxy.id },
      }),
      1,
    );
    const audits = await prisma.auditEvent.findMany({
      where: {
        actorSubject: actor.subject,
        resourceId: { in: [configured.proxy.id, configured.revision.id] },
      },
      orderBy: { createdAt: 'asc' },
    });
    assert.deepEqual(audits.map(event => event.action), [
      'proxy.create',
      'proxyRevision.import',
    ]);
  });

  it('does not create a proxy when configured creation validation fails', async () => {
    const name = 'Rejected configured proxy';
    await assert.rejects(
      createConfiguredApiProxy({
        organizationId,
        name,
        openapiSource: 'swagger: "2.0"',
        gatewayConfigSource: '{}',
        actor,
      }),
      (error: unknown) => error instanceof ProxyBundleError,
    );
    assert.equal(await prisma.apiProxy.count({ where: { name } }), 0);
  });

  it('numbers concurrent immutable imports and rejects invalid bundles atomically', async () => {
    const proxy = await createApiProxy({
      organizationId,
      name: 'Concurrent revisions',
      actor,
    });
    const [first, second] = await Promise.all([
      importProxyRevision({
        proxyId: proxy.id,
        ...bundle(`/revision-test-${suffix}`, 'getFirst'),
        actor,
      }),
      importProxyRevision({
        proxyId: proxy.id,
        ...bundle(`/revision-test-${suffix}`, 'getSecond'),
        actor,
      }),
    ]);
    assert.deepEqual(
      [first.revisionNumber, second.revisionNumber].sort(),
      [1, 2],
    );
    await assert.rejects(
      importProxyRevision({
        proxyId: proxy.id,
        openapiSource: 'swagger: "2.0"',
        gatewayConfigSource: '{}',
        actor,
      }),
      (error: unknown) => error instanceof ProxyBundleError,
    );
    assert.equal(
      await prisma.apiProxyRevision.count({ where: { proxyId: proxy.id } }),
      2,
    );
  });

  it('keeps one active deployment and records rollback as new history', async () => {
    const basePath = `/deployment-test-${suffix}`;
    const proxy = await createApiProxy({
      organizationId,
      name: 'Deployment history',
      actor,
    });
    const revision1 = await importProxyRevision({
      proxyId: proxy.id,
      ...bundle(basePath, 'getRevisionOne'),
      actor,
    });
    const revision2 = await importProxyRevision({
      proxyId: proxy.id,
      ...bundle(basePath, 'getRevisionTwo'),
      actor,
    });
    await deployProxyRevision({
      proxyId: proxy.id,
      revisionNumber: revision1.revisionNumber,
      environmentId: 'env-qual-es',
      upstreamBaseUrl: 'https://revision-one.example.test',
      actor,
    });
    const replacement = await deployProxyRevision({
      proxyId: proxy.id,
      revisionNumber: revision2.revisionNumber,
      environmentId: 'env-qual-es',
      upstreamBaseUrl: 'https://revision-two.example.test',
      actor,
    });
    const rollback = await deployProxyRevision({
      proxyId: proxy.id,
      revisionNumber: revision1.revisionNumber,
      environmentId: 'env-qual-es',
      upstreamBaseUrl: 'https://revision-one.example.test',
      actor,
    });
    assert.equal(rollback.revision.revisionNumber, 1);
    const history = await prisma.proxyDeployment.findMany({
      where: { proxyId: proxy.id, environmentId: 'env-qual-es' },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(history.length, 3);
    assert.equal(history.filter(item => item.status === 'active').length, 1);
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        resourceType: 'ProxyDeployment',
        resourceId: { in: [replacement.id, rollback.id] },
      },
    });
    const rollbackFlags = new Map(auditEvents.map(event => [
      event.resourceId,
      (event.metadata as { rollback: boolean }).rollback,
    ]));
    assert.equal(rollbackFlags.get(replacement.id), false);
    assert.equal(rollbackFlags.get(rollback.id), true);

    await deployProxyRevision({
      proxyId: proxy.id,
      revisionNumber: revision2.revisionNumber,
      environmentId: 'env-pprod-es',
      upstreamBaseUrl: 'https://revision-two-pprod.example.test',
      actor,
    });
    await assert.rejects(
      deployProxyRevision({
        proxyId: proxy.id,
        revisionNumber: revision1.revisionNumber,
        environmentId: 'env-prod-es',
        upstreamBaseUrl: 'https://revision-one-prod.example.test',
        actor,
      }),
      (error: unknown) =>
        error instanceof ProxyDeploymentError && error.code === 'promotion_required',
    );
  });

  it('rejects an active base path conflict without changing the current deployment', async () => {
    const basePath = `/conflict-test-${suffix}`;
    const firstProxy = await createApiProxy({
      organizationId,
      name: 'Conflict owner',
      actor,
    });
    const secondProxy = await createApiProxy({
      organizationId,
      name: 'Conflict candidate',
      actor,
    });
    for (const [proxyId, operationId] of [
      [firstProxy.id, 'getOwner'],
      [secondProxy.id, 'getCandidate'],
    ]) {
      await importProxyRevision({ proxyId, ...bundle(basePath, operationId), actor });
    }
    await deployProxyRevision({
      proxyId: firstProxy.id,
      revisionNumber: 1,
      environmentId: 'env-qual-fr',
      upstreamBaseUrl: 'https://owner.example.test',
      actor,
    });
    await assert.rejects(
      deployProxyRevision({
        proxyId: secondProxy.id,
        revisionNumber: 1,
        environmentId: 'env-qual-fr',
        upstreamBaseUrl: 'https://candidate.example.test',
        actor,
      }),
      (error: unknown) =>
        error instanceof ProxyDeploymentError && error.code === 'deployment_conflict',
    );
    assert.equal(
      await prisma.proxyDeployment.count({
        where: { proxyId: secondProxy.id, environmentId: 'env-qual-fr' },
      }),
      0,
    );
  });
});
