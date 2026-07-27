import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../src/server.js';
import type { ManagementEnv } from '../src/config/env.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1',
  PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  OIDC_ISSUER: 'https://identity.test/realms/platform',
  OIDC_AUDIENCE: 'management-api',
};

describe('management API authentication boundary', () => {
  it('rejects missing tokens and identities without membership', async () => {
    const server = buildServer({
      config,
      logger: false,
      verifier: {
        verify: async () => ({
          issuer: config.OIDC_ISSUER,
          subject: 'unknown-user',
          claims: {},
        }),
      },
      memberships: { findActive: async () => [] },
    });
    const missing = await server.inject({ method: 'GET', url: '/v1/me' });
    assert.equal(missing.statusCode, 401);
    const unknown = await server.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(unknown.statusCode, 403);
    await server.close();
  });

  it('exposes only the memberships loaded for the verified identity', async () => {
    const server = buildServer({
      config,
      logger: false,
      verifier: {
        verify: async () => ({
          issuer: config.OIDC_ISSUER,
          subject: 'organization-admin',
          claims: {},
        }),
      },
      memberships: {
        findActive: async (issuer, subject) => [{
          id: 'membership-1',
          role: 'organizationAdmin',
          organizationId: 'org-a',
          active: issuer === config.OIDC_ISSUER
            && subject === 'organization-admin',
        }],
      },
    });
    const response = await server.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer valid-token' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().subject, 'organization-admin');
    assert.equal(response.json().memberships[0].organizationId, 'org-a');
    await server.close();
  });
});
