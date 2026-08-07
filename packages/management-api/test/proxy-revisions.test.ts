import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../src/server.js';
import type { ManagementEnv } from '../src/config/env.js';
import type { ProxyRevisionOperations } from '../src/services/proxy-revisions.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1',
  PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform',
  OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys',
  PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust-bundle.pem',
  PKI_CRL_BUNDLE_FILE: '/tmp/test-crl-bundle.pem',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-client-validation.yaml',
};

function multipart(files: Record<string, string>) {
  const boundary = 'gateway-test-boundary';
  const body = Object.entries(files).map(([name, content]) => [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${name}"; filename="${name}.yaml"`,
    'Content-Type: application/yaml',
    '',
    content,
  ].join('\r\n')).join('\r\n') + `\r\n--${boundary}--\r\n`;
  return {
    payload: Buffer.from(body),
    headers: {
      authorization: 'Bearer token',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

function configuredMultipart(name: string, files: Record<string, string>) {
  const boundary = 'gateway-configured-test-boundary';
  const field = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="name"',
    '',
    name,
  ].join('\r\n');
  const fileParts = Object.entries(files).map(([fieldName, content]) => [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fieldName}.yaml"`,
    'Content-Type: application/yaml',
    '',
    content,
  ].join('\r\n'));
  const body = [field, ...fileParts].join('\r\n') + `\r\n--${boundary}--\r\n`;
  return {
    payload: Buffer.from(body),
    headers: {
      authorization: 'Bearer token',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  };
}

const configuredOperations: Pick<
  ProxyRevisionOperations,
  'validateConfiguration' | 'createConfiguredProxy'
> = {
  validateConfiguration: async () => ({ openapi: {}, compiled: null }),
  createConfiguredProxy: async () => ({ proxy: {}, revision: {} }),
};

function serverWith(revisions: ProxyRevisionOperations) {
  return buildServer({
    config,
    logger: false,
    verifier: {
      verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'admin', claims: {} }),
    },
    memberships: {
      findActive: async () => [{
        id: 'membership-1',
        role: 'organizationAdmin',
        organizationId: 'org-a',
        active: true,
      }],
    },
    proxyRevisions: revisions,
  });
}

describe('proxy revision management routes', () => {
  it('creates proxies and imports both bundle files', async () => {
    const calls: string[] = [];
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async (organizationId, input) => {
        calls.push(`create:${organizationId}:${input.name}`);
        return { id: 'proxy-1' };
      },
      updateProxy: async () => ({}),
      importRevision: async (proxyId, input) => {
        calls.push(`import:${proxyId}:${input.openapiSource}:${input.gatewayConfigSource}`);
        return { revisionNumber: 1 };
      },
      listRevisions: async () => [],
      getRevision: async () => ({ revisionNumber: 1 }),
      getRevisionSource: async (_proxyId, _revision, source) => `${source}: source`,
      deployRevision: async () => ({}),
      retireDeployment: async () => ({}),
    };
    const server = serverWith(revisions);
    const created = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/proxies',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Accounts' },
    });
    assert.equal(created.statusCode, 201);
    const imported = await server.inject({
      method: 'POST',
      url: '/v1/proxies/proxy-1/revisions',
      ...multipart({ openapi: 'openapi: 3.1.0', gateway: 'apiVersion: gateway.platform/v1' }),
    });
    assert.equal(imported.statusCode, 201);
    assert.deepEqual(calls, [
      'create:org-a:Accounts',
      'import:proxy-1:openapi: 3.1.0:apiVersion: gateway.platform/v1',
    ]);
    await server.close();
  });

  it('validates source and creates a configured proxy atomically', async () => {
    const calls: unknown[] = [];
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async () => ({}),
      validateConfiguration: async (organizationId, input) => {
        calls.push({ action: 'validate', organizationId, input });
        return { openapi: { openapiVersion: '3.1.0' }, compiled: null };
      },
      createConfiguredProxy: async (organizationId, input) => {
        calls.push({ action: 'create-configured', organizationId, input });
        return {
          proxy: { id: 'proxy-configured' },
          revision: { revisionNumber: 1 },
        };
      },
      updateProxy: async () => ({}),
      importRevision: async () => ({}),
      listRevisions: async () => [],
      getRevision: async () => ({}),
      getRevisionSource: async () => '',
      deployRevision: async () => ({}),
      retireDeployment: async () => ({}),
    };
    const server = serverWith(revisions);
    const validated = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/proxy-configurations/validate',
      ...multipart({ openapi: 'openapi: 3.1.0' }),
    });
    assert.equal(validated.statusCode, 200);
    const created = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/proxies/configured',
      ...configuredMultipart('Accounts API', {
        openapi: 'openapi: 3.1.0',
        gateway: 'apiVersion: gateway.platform/v1',
      }),
    });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.json(), {
      proxy: { id: 'proxy-configured' },
      revision: { revisionNumber: 1 },
    });
    assert.deepEqual(calls, [
      {
        action: 'validate',
        organizationId: 'org-a',
        input: {
          openapiSource: 'openapi: 3.1.0',
          gatewayConfigSource: undefined,
        },
      },
      {
        action: 'create-configured',
        organizationId: 'org-a',
        input: {
          name: 'Accounts API',
          openapiSource: 'openapi: 3.1.0',
          gatewayConfigSource: 'apiVersion: gateway.platform/v1',
        },
      },
    ]);
    await server.close();
  });

  it('exposes revision metadata and original sources', async () => {
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async () => ({}),
      updateProxy: async () => ({}),
      importRevision: async () => ({}),
      listRevisions: async proxyId => [{ proxyId, revisionNumber: 1 }],
      getRevision: async (proxyId, revisionNumber) => ({ proxyId, revisionNumber }),
      getRevisionSource: async (_proxyId, _revision, source) => `${source}: source`,
      deployRevision: async () => ({}),
      retireDeployment: async () => ({}),
    };
    const server = serverWith(revisions);
    const headers = { authorization: 'Bearer token' };
    for (const route of [
      '/v1/proxies/proxy-1/revisions',
      '/v1/proxies/proxy-1/revisions/1',
      '/v1/proxies/proxy-1/revisions/1/openapi',
      '/v1/proxies/proxy-1/revisions/1/gateway-config',
    ]) {
      const response = await server.inject({ method: 'GET', url: route, headers });
      assert.equal(response.statusCode, 200, route);
    }
    await server.close();
  });

  it('rejects incomplete multipart bundles before calling the service', async () => {
    let called = false;
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async () => ({}),
      updateProxy: async () => ({}),
      importRevision: async () => {
        called = true;
        return {};
      },
      listRevisions: async () => [],
      getRevision: async () => ({}),
      getRevisionSource: async () => '',
      deployRevision: async () => ({}),
      retireDeployment: async () => ({}),
    };
    const server = serverWith(revisions);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/proxies/proxy-1/revisions',
      ...multipart({ openapi: 'openapi: 3.1.0' }),
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'invalid_gateway_config');
    assert.equal(called, false);
    await server.close();
  });

  it('activates a revision and reports the queued runtime version', async () => {
    const calls: unknown[] = [];
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async () => ({}),
      updateProxy: async () => ({}),
      importRevision: async () => ({}),
      listRevisions: async () => [],
      getRevision: async () => ({}),
      getRevisionSource: async () => '',
      deployRevision: async (proxyId, revisionNumber, input) => {
        calls.push({ proxyId, revisionNumber, input });
        return { id: 'deployment-2', status: 'active', configVersion: 12 };
      },
      retireDeployment: async () => ({}),
    };
    const server = serverWith(revisions);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/proxies/proxy-1/revisions/2/deployments',
      headers: { authorization: 'Bearer token' },
      payload: {
        environmentId: 'env-qual-es',
        upstreamBaseUrl: 'https://backend.test',
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().runtimeRefreshRequired, false);
    assert.deepEqual(response.json().runtimeSync, { version: 12, state: 'queued' });
    assert.equal(response.json().deployment.configVersion, undefined);
    assert.deepEqual(calls, [{
      proxyId: 'proxy-1',
      revisionNumber: 2,
      input: {
        environmentId: 'env-qual-es',
        upstreamBaseUrl: 'https://backend.test',
      },
    }]);
    await server.close();
  });

  it('updates only mutable logical proxy fields', async () => {
    const calls: unknown[] = [];
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async () => ({}),
      updateProxy: async (proxyId, input) => {
        calls.push({ proxyId, input });
        return { id: proxyId, ...input };
      },
      importRevision: async () => ({}),
      listRevisions: async () => [],
      getRevision: async () => ({}),
      getRevisionSource: async () => '',
      deployRevision: async () => ({}),
      retireDeployment: async () => ({}),
    };
    const server = serverWith(revisions);
    const response = await server.inject({
      method: 'PATCH',
      url: '/v1/proxies/proxy-1',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Accounts API', active: false },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [{
      proxyId: 'proxy-1',
      input: { name: 'Accounts API', active: false },
    }]);
    const immutable = await server.inject({
      method: 'PATCH',
      url: '/v1/proxies/proxy-1',
      headers: { authorization: 'Bearer token' },
      payload: { systemManaged: false },
    });
    assert.equal(immutable.statusCode, 400);
    await server.close();
  });

  it('retires a deployment and reports the queued runtime version', async () => {
    const calls: string[] = [];
    const revisions: ProxyRevisionOperations = {
      ...configuredOperations,
      createProxy: async () => ({}),
      updateProxy: async () => ({}),
      importRevision: async () => ({}),
      listRevisions: async () => [],
      getRevision: async () => ({}),
      getRevisionSource: async () => '',
      deployRevision: async () => ({}),
      retireDeployment: async deploymentId => {
        calls.push(deploymentId);
        return { id: deploymentId, status: 'retired', configVersion: 13 };
      },
    };
    const server = serverWith(revisions);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/proxy-deployments/deployment-1/retire',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().runtimeRefreshRequired, false);
    assert.deepEqual(response.json().runtimeSync, { version: 13, state: 'queued' });
    assert.equal(response.json().deployment.status, 'retired');
    assert.deepEqual(calls, ['deployment-1']);
    await server.close();
  });
});
