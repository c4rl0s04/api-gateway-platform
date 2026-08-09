import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LabUpstreamError, type LabPrincipal } from '@api-gateway/database';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type {
  LabUpstreamMutation,
  LabUpstreamOperations,
  LabUpstreamUpdate,
} from '../src/services/lab-upstreams.js';

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

describe('lab upstream routes', () => {
  it('accepts declarative mocks and public HTTPS definitions for the OIDC owner', async () => {
    const calls: unknown[] = [];
    const operations: LabUpstreamOperations = {
      list: async principal => { calls.push(['list', principal]); return []; },
      create: async (input, principal) => { calls.push(['create', input, principal]); return input; },
      update: async (id, input, principal) => { calls.push(['update', id, input, principal]); return input; },
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labUpstreams: operations,
    });
    const headers = { authorization: 'Bearer token' };
    assert.equal((await server.inject({ method: 'GET', url: '/lab/v1/upstreams', headers })).statusCode, 200);
    const created = await server.inject({
      method: 'POST',
      url: '/lab/v1/upstreams',
      headers,
      payload: {
        name: 'Accounts mock',
        kind: 'mock',
        routes: [{ method: 'GET', path: '/accounts', status: 200, body: [] }],
      },
    });
    assert.equal(created.statusCode, 201);
    const updated = await server.inject({
      method: 'PATCH',
      url: '/lab/v1/upstreams/upstream-1',
      headers,
      payload: { active: false },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(calls.length, 3);
    const createCall = calls[1] as ['create', LabUpstreamMutation, LabPrincipal];
    assert.equal(createCall[1].kind, 'mock');
    assert.deepEqual(createCall[2], { issuer: config.OIDC_ISSUER, subject: 'owner' });
    const updateCall = calls[2] as ['update', string, LabUpstreamUpdate, LabPrincipal];
    assert.deepEqual(updateCall.slice(1, 3), ['upstream-1', { active: false }]);
    await server.close();
  });

  it('maps blocked and cross-workspace upstreams to stable errors', async () => {
    const operations: LabUpstreamOperations = {
      list: async () => [],
      create: async () => { throw new LabUpstreamError('lab_upstream_blocked', 'blocked'); },
      update: async () => { throw new LabUpstreamError('lab_resource_not_found', 'missing'); },
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labUpstreams: operations,
    });
    const headers = { authorization: 'Bearer token' };
    const blocked = await server.inject({
      method: 'POST',
      url: '/lab/v1/upstreams',
      headers,
      payload: { name: 'Blocked', kind: 'publicHttps', targetUrl: 'https://localhost' },
    });
    assert.equal(blocked.statusCode, 400);
    assert.equal(blocked.json().error, 'lab_upstream_blocked');
    const missing = await server.inject({
      method: 'PATCH',
      url: '/lab/v1/upstreams/other-workspace',
      headers,
      payload: { active: false },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error, 'lab_resource_not_found');
    await server.close();
  });
});
