import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  ApplicationManagementError,
  prisma,
  verifyConsumerSecret,
} from '@api-gateway/database';
import { ApplicationService } from '../src/services/applications.js';
import { AuditService } from '../src/services/audit.js';
import { OrganizationService } from '../src/services/organizations.js';
import { ProductService } from '../src/services/products.js';
import { ProxyRevisionService } from '../src/services/proxy-revisions.js';

const integration = process.env.RUN_DATABASE_INTEGRATION === '1'
  ? describe
  : describe.skip;
const suffix = randomUUID();
const actor = {
  issuer: 'test://management-integration',
  subject: `platform-admin-${suffix}`,
  memberships: [{
    id: `membership-${suffix}`,
    role: 'platformAdmin' as const,
    organizationId: null,
    active: true,
  }],
};

integration('management control-plane persistence', () => {
  const organizations = new OrganizationService();
  const products = new ProductService();
  const proxies = new ProxyRevisionService();
  const applications = new ApplicationService();
  const audit = new AuditService();
  let organizationId = '';
  let proxyId = '';
  let productId = '';
  let appId = '';

  async function cleanup() {
    if (organizationId) {
      await prisma.developerApp.deleteMany({ where: { organizationId } });
      await prisma.apiProduct.deleteMany({ where: { organizationId } });
      await prisma.apiProxy.deleteMany({ where: { organizationId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.auditEvent.deleteMany({
      where: { actorSubject: actor.subject },
    });
  }

  before(cleanup);
  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('persists and audits the complete management lifecycle', async () => {
    const organization = await organizations.create(
      { name: `Management integration ${suffix}` },
      actor,
    ) as { id: string };
    organizationId = organization.id;
    await organizations.update(
      organizationId,
      { name: `Management integration renamed ${suffix}` },
      actor,
    );

    const proxy = await proxies.createProxy(
      organizationId,
      { name: 'Integration proxy' },
      actor,
    ) as { id: string };
    proxyId = proxy.id;
    await proxies.updateProxy(proxyId, { name: 'Updated integration proxy' }, actor);
    const basePath = `/management-integration-${suffix}`;
    const revision = await proxies.importRevision(proxyId, {
      openapiSource: JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'Management integration', version: '1.0.0' },
        paths: {
          '/resource': {
            get: {
              operationId: 'getResource',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      }),
      gatewayConfigSource: JSON.stringify({
        apiVersion: 'gateway.platform/v1',
        basePath,
        defaults: { policies: [] },
        operations: { getResource: { targetPath: '/health' } },
      }),
    }, actor) as { revisionNumber: number };
    const deployed = await proxies.deployRevision(proxyId, revision.revisionNumber, {
      environmentId: 'env-qual-es',
      upstreamBaseUrl: 'http://mock-backend:4000',
    }, actor) as { id: string };

    const product = await products.create(organizationId, {
      name: 'Integration product',
      active: true,
      scopes: ['integration:read', 'integration:write'],
      proxyIds: [proxyId],
      environmentIds: [],
    }, actor) as { id: string };
    productId = product.id;
    const registration = await applications.register(organizationId, {
      name: 'Integration app',
      products: [{
        productId,
        scopes: ['integration:read', 'integration:write'],
      }],
    }, actor) as {
      application: { id: string };
      credential: { id: string };
      consumerSecret: string;
    };
    appId = registration.application.id;
    const initialHash = await prisma.appCredential.findUniqueOrThrow({
      where: { id: registration.credential.id },
      select: { consumerSecretHash: true },
    });
    assert.equal(
      await verifyConsumerSecret(
        registration.consumerSecret,
        initialHash.consumerSecretHash,
      ),
      true,
    );

    const additional = await applications.createCredential(appId, {
      products: [{ productId, scopes: ['integration:read'] }],
    }, actor) as { credential: { id: string }; consumerSecret: string };
    const rotated = await applications.rotateCredential(
      additional.credential.id,
      actor,
    ) as { consumerSecret: string };
    const rotatedHash = await prisma.appCredential.findUniqueOrThrow({
      where: { id: additional.credential.id },
      select: { consumerSecretHash: true },
    });
    assert.equal(
      await verifyConsumerSecret(additional.consumerSecret, rotatedHash.consumerSecretHash),
      false,
    );
    assert.equal(
      await verifyConsumerSecret(rotated.consumerSecret, rotatedHash.consumerSecretHash),
      true,
    );

    await applications.replaceCredentialGrants(
      registration.credential.id,
      { products: [] },
      actor,
    );
    assert.equal(
      (await prisma.credentialProductGrant.findUniqueOrThrow({
        where: {
          credentialId_productId: {
            credentialId: registration.credential.id,
            productId,
          },
        },
      })).status,
      'revoked',
    );
    await applications.replaceCredentialGrants(
      registration.credential.id,
      { products: [{
        productId,
        scopes: ['integration:read', 'integration:write'],
      }] },
      actor,
    );
    await products.update(productId, { scopes: ['integration:read'] }, actor);
    assert.deepEqual(
      (await prisma.credentialProductGrant.findUniqueOrThrow({
        where: {
          credentialId_productId: {
            credentialId: registration.credential.id,
            productId,
          },
        },
      })).scopes,
      ['integration:read'],
    );

    const jwk = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ format: 'jwk' });
    const publicKey = await applications.registerPublicKey(
      registration.credential.id,
      { kid: `integration-key-${suffix}`, jwk },
      actor,
    ) as { id: string };
    const revokedKey = await applications.revokePublicKey(publicKey.id, actor) as {
      status: string;
    };
    assert.equal(revokedKey.status, 'revoked');

    await proxies.retireDeployment(deployed.id, actor);
    assert.equal(
      (await prisma.proxyDeployment.findUniqueOrThrow({
        where: { id: deployed.id },
      })).status,
      'retired',
    );
    await applications.update(appId, { status: 'revoked' }, actor);
    await assert.rejects(
      applications.update(appId, { status: 'approved' }, actor),
      (error: unknown) => error instanceof ApplicationManagementError
        && error.code === 'invalid_status_transition',
    );

    const events = await audit.list({ organizationId, limit: 200 }, actor) as {
      items: Array<{ action: string }>;
    };
    const actions = new Set(events.items.map(event => event.action));
    for (const action of [
      'organization.create',
      'proxy.create',
      'proxyRevision.import',
      'proxyDeployment.create',
      'product.create',
      'application.register',
      'credential.create',
      'credential.rotateSecret',
      'credential.replaceProductGrants',
      'publicKey.register',
      'publicKey.revoke',
      'proxyDeployment.retire',
      'application.update',
    ]) {
      assert.equal(actions.has(action), true, action);
    }
  });
});
