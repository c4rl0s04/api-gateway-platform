import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { LabApplicationOperations } from '../src/services/lab-applications.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1', PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform', OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki', PKI_MASTER_KEY_FILE: '/tmp/test-master',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust', PKI_CRL_BUNDLE_FILE: '/tmp/test-crl',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-sds',
};

function operations(calls: unknown[]): LabApplicationOperations {
  const result = async (...args: unknown[]) => { calls.push(args); return { id: 'resource-1' }; };
  return {
    list: result, get: result, register: result, update: result,
    createCredential: async (...args) => {
      calls.push(args);
      return { credential: { id: 'credential-1' }, consumerSecret: 'one-time-secret' };
    },
    getCredential: result, updateCredential: result, rotateCredential: result,
    replaceGrants: result, listPublicKeys: result, registerPublicKey: result,
    revokePublicKey: result,
  };
}

describe('lab application routes', () => {
  it('creates apps and credentials from product grants without accepting purpose or ownership fields', async () => {
    const calls: unknown[] = [];
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labApplications: operations(calls),
    });
    const headers = { authorization: 'Bearer token' };
    const app = await server.inject({
      method: 'POST', url: '/lab/v1/apps', headers,
      payload: { name: 'Test App', products: [{ productId: 'product-1', scopes: ['read'] }] },
    });
    assert.equal(app.statusCode, 201);
    const credential = await server.inject({
      method: 'POST', url: '/lab/v1/apps/app-1/credentials', headers,
      payload: { products: [{ productId: 'product-1', scopes: ['read'] }] },
    });
    assert.equal(credential.statusCode, 201);
    assert.equal(credential.json().consumerSecret, 'one-time-secret');
    const appInput = (calls[0] as unknown[])[0] as Record<string, unknown>;
    const credentialInput = (calls[1] as unknown[])[1] as Record<string, unknown>;
    assert.equal('organizationId' in appInput, false);
    assert.equal('purpose' in credentialInput, false);
    await server.close();
  });

  it('supports consumer-key changes, rotations, grants, and public JWK registration', async () => {
    const calls: unknown[] = [];
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labApplications: operations(calls),
    });
    const headers = { authorization: 'Bearer token' };
    const requests = [
      server.inject({ method: 'PATCH', url: '/lab/v1/credentials/credential-1', headers, payload: { consumerKey: 'custom-key' } }),
      server.inject({ method: 'POST', url: '/lab/v1/credentials/credential-1/rotate-secret', headers }),
      server.inject({ method: 'PUT', url: '/lab/v1/credentials/credential-1/grants', headers, payload: { products: [] } }),
      server.inject({ method: 'POST', url: '/lab/v1/credentials/credential-1/public-keys', headers, payload: {
        kid: 'key-1', jwk: { kty: 'RSA', n: 'public-modulus', e: 'AQAB' },
      } }),
    ];
    for (const response of await Promise.all(requests)) assert.ok(response.statusCode < 300);
    assert.equal(calls.length, 4);
    await server.close();
  });

  it('rejects attempts to select credential purpose from the browser', async () => {
    let called = false;
    const apps = operations([]);
    apps.createCredential = async () => { called = true; return {}; };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labApplications: apps,
    });
    const response = await server.inject({
      method: 'POST', url: '/lab/v1/apps/app-1/credentials',
      headers: { authorization: 'Bearer token' },
      payload: { products: [{ productId: 'product-1' }], purpose: 'standard' },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(called, false);
    await server.close();
  });
});
