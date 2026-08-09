import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LabWorkspaceError, type LabPrincipal } from '@api-gateway/database';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { LabWorkspaceOperations } from '../src/services/lab-workspaces.js';

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

function operations(calls: Array<{ action: string; principal: LabPrincipal }>): LabWorkspaceOperations {
  const record = (action: string) => async (principal: LabPrincipal) => {
    calls.push({ action, principal });
    return action === 'create'
      ? { created: true, workspace: { id: 'workspace-1' } }
      : { id: 'workspace-1', action };
  };
  return {
    create: record('create'),
    get: record('get'),
    reset: record('reset'),
    revoke: record('revoke'),
  };
}

describe('personal lab workspace routes', () => {
  it('uses the verified OIDC identity without requiring an admin membership', async () => {
    const calls: Array<{ action: string; principal: LabPrincipal }> = [];
    const server = buildServer({
      config,
      logger: false,
      verifier: {
        verify: async () => ({
          issuer: config.OIDC_ISSUER,
          subject: 'lab-owner',
          claims: {},
        }),
      },
      memberships: { findActive: async () => [] },
      labWorkspaces: operations(calls),
    });

    const requests = [
      { method: 'POST' as const, url: '/lab/v1/workspace' },
      { method: 'GET' as const, url: '/lab/v1/workspace' },
      { method: 'POST' as const, url: '/lab/v1/workspace/reset' },
      { method: 'POST' as const, url: '/lab/v1/workspace/revoke' },
    ];
    for (const request of requests) {
      const response = await server.inject({
        ...request,
        headers: { authorization: 'Bearer valid-token' },
      });
      assert.ok(response.statusCode >= 200 && response.statusCode < 300);
    }
    assert.deepEqual(calls, [
      { action: 'create', principal: { issuer: config.OIDC_ISSUER, subject: 'lab-owner' } },
      { action: 'get', principal: { issuer: config.OIDC_ISSUER, subject: 'lab-owner' } },
      { action: 'reset', principal: { issuer: config.OIDC_ISSUER, subject: 'lab-owner' } },
      { action: 'revoke', principal: { issuer: config.OIDC_ISSUER, subject: 'lab-owner' } },
    ]);
    await server.close();
  });

  it('rejects missing or invalid bearer tokens before invoking the domain', async () => {
    const calls: Array<{ action: string; principal: LabPrincipal }> = [];
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => { throw new Error('invalid token'); } },
      labWorkspaces: operations(calls),
    });
    const missing = await server.inject({ method: 'GET', url: '/lab/v1/workspace' });
    const invalid = await server.inject({
      method: 'GET',
      url: '/lab/v1/workspace',
      headers: { authorization: 'Bearer invalid' },
    });
    assert.equal(missing.statusCode, 401);
    assert.equal(invalid.statusCode, 401);
    assert.deepEqual(calls, []);
    await server.close();
  });

  it('returns stable status codes for workspace lifecycle errors', async () => {
    const makeServer = (error: LabWorkspaceError) => buildServer({
      config,
      logger: false,
      verifier: {
        verify: async () => ({
          issuer: config.OIDC_ISSUER,
          subject: 'lab-owner',
          claims: {},
        }),
      },
      labWorkspaces: {
        create: async () => { throw error; },
        get: async () => { throw error; },
        reset: async () => { throw error; },
        revoke: async () => { throw error; },
      },
    });
    const cases = [
      [new LabWorkspaceError('lab_resource_not_found', 'missing'), 404],
      [new LabWorkspaceError('lab_expired', 'expired'), 410],
      [new LabWorkspaceError('lab_limit_reached', 'limited'), 429],
    ] as const;
    for (const [error, status] of cases) {
      const server = makeServer(error);
      const response = await server.inject({
        method: 'GET',
        url: '/lab/v1/workspace',
        headers: { authorization: 'Bearer valid-token' },
      });
      assert.equal(response.statusCode, status);
      assert.equal(response.json().error, error.code);
      await server.close();
    }
  });
});
