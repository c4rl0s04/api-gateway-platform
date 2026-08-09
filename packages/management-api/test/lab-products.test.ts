import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { LabProductOperations } from '../src/services/lab-products.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1', PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform', OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys', PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust.pem', PKI_CRL_BUNDLE_FILE: '/tmp/test-crl.pem',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-sds.yaml',
};

describe('lab product routes', () => {
  it('manages product relationships without accepting an organization identifier', async () => {
    const calls: unknown[] = [];
    const result = async (...args: unknown[]) => { calls.push(args); return { id: 'product-1' }; };
    const products: LabProductOperations = {
      listEnvironments: result,
      list: result,
      get: result,
      create: result,
      update: result,
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labProducts: products,
    });
    const response = await server.inject({
      method: 'POST',
      url: '/lab/v1/products',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Banking Product',
        scopes: ['banking:read'],
        proxyIds: ['proxy-1'],
        environmentIds: ['qual-es'],
        active: true,
      },
    });
    assert.equal(response.statusCode, 201);
    const input = (calls[0] as unknown[])[0] as Record<string, unknown>;
    assert.equal('organizationId' in input, false);
    assert.deepEqual(input.proxyIds, ['proxy-1']);
    await server.close();
  });

  it('rejects unknown body fields before calling the service', async () => {
    let called = false;
    const result = async () => { called = true; return []; };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labProducts: {
        listEnvironments: result, list: result, get: result, create: result, update: result,
      },
    });
    const response = await server.inject({
      method: 'POST',
      url: '/lab/v1/products',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Bad', organizationId: 'foreign' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(called, false);
    await server.close();
  });
});
