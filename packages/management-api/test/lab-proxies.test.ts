import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { LabProxyOperations } from '../src/services/lab-proxies.js';

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

function operations(calls: unknown[]): LabProxyOperations {
  const result = async (...args: unknown[]) => { calls.push(args); return { id: 'resource-1' }; };
  return {
    list: result,
    get: result,
    listDeployments: result,
    create: result,
    validate: result,
    createConfigured: result,
    update: result,
    importRevision: result,
    listRevisions: result,
    getRevision: result,
    deploy: async (...args) => { calls.push(args); return { id: 'deployment-1', configVersion: 12 }; },
    retire: async (...args) => { calls.push(args); return { id: 'deployment-1', configVersion: 13 }; },
  };
}

describe('lab proxy routes', () => {
  it('creates logical proxies and deploys revisions using upstream IDs', async () => {
    const calls: unknown[] = [];
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labProxies: operations(calls),
    });
    const headers = { authorization: 'Bearer token' };
    const created = await server.inject({
      method: 'POST',
      url: '/lab/v1/proxies',
      headers,
      payload: { name: 'Accounts API' },
    });
    assert.equal(created.statusCode, 201);
    const deployed = await server.inject({
      method: 'POST',
      url: '/lab/v1/proxies/proxy-1/revisions/2/deployments',
      headers,
      payload: { environmentId: 'qual-es', upstreamId: 'upstream-1' },
    });
    assert.equal(deployed.statusCode, 201);
    assert.deepEqual(deployed.json().runtimeSync, { version: 12, state: 'queued' });
    const deployCall = calls[1] as unknown[];
    assert.deepEqual(deployCall.slice(0, 3), [
      'proxy-1',
      2,
      { environmentId: 'qual-es', upstreamId: 'upstream-1' },
    ]);
    assert.equal('upstreamBaseUrl' in (deployCall[2] as object), false);
    await server.close();
  });

  it('imports complete OpenAPI and gateway bundles atomically', async () => {
    const calls: unknown[] = [];
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labProxies: operations(calls),
    });
    const boundary = 'lab-bundle-boundary';
    const payload = [
      `--${boundary}\r\nContent-Disposition: form-data; name="openapi"; filename="openapi.yaml"\r\nContent-Type: application/yaml\r\n\r\nopenapi: 3.0.3\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="gateway"; filename="gateway.yaml"\r\nContent-Type: application/yaml\r\n\r\napiVersion: gateway.platform/v1\r\n`,
      `--${boundary}--\r\n`,
    ].join('');
    const response = await server.inject({
      method: 'POST',
      url: '/lab/v1/proxies/proxy-1/revisions',
      headers: {
        authorization: 'Bearer token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    assert.equal(response.statusCode, 201);
    const call = calls[0] as unknown[];
    assert.equal(call[0], 'proxy-1');
    assert.deepEqual(call[1], {
      openapiSource: 'openapi: 3.0.3',
      gatewayConfigSource: 'apiVersion: gateway.platform/v1',
    });
    await server.close();
  });

  it('hides cross-workspace authorization failures as missing resources', async () => {
    const denied = Object.assign(new Error('Organization access denied'), { statusCode: 403 });
    const proxies = operations([]);
    proxies.get = async () => { throw denied; };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labProxies: proxies,
    });
    const response = await server.inject({
      method: 'GET',
      url: '/lab/v1/proxies/foreign-proxy',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'lab_resource_not_found');
    await server.close();
  });
});
