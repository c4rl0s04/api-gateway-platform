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
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys',
  PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust-bundle.pem',
  PKI_CRL_BUNDLE_FILE: '/tmp/test-crl-bundle.pem',
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

  it('reserves certificate authority mutations for platform admins', async () => {
    const mutations: string[] = [];
    const certificateAuthorities = {
      list: async () => [],
      createManaged: async () => {
        mutations.push('create');
        return { id: 'authority-1' };
      },
      importExternal: async () => ({ id: 'authority-2' }),
      setStatus: async () => ({ id: 'authority-1' }),
      rotate: async () => ({ id: 'authority-2' }),
      refreshCrl: async () => ({ id: 'authority-1' }),
    };
    const makeServer = (role: 'organizationAdmin' | 'platformAdmin') =>
      buildServer({
        config,
        logger: false,
        verifier: {
          verify: async () => ({
            issuer: config.OIDC_ISSUER,
            subject: role,
            claims: {},
          }),
        },
        memberships: {
          findActive: async () => [{
            id: `membership-${role}`,
            role,
            organizationId: role === 'platformAdmin' ? null : 'org-a',
            active: true,
          }],
        },
        certificateAuthorities,
      });
    const organizationServer = makeServer('organizationAdmin');
    const denied = await organizationServer.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/certificate-authorities/managed',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Denied CA' },
    });
    assert.equal(denied.statusCode, 403);
    await organizationServer.close();

    const platformServer = makeServer('platformAdmin');
    const created = await platformServer.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/certificate-authorities/managed',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Managed CA' },
    });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(mutations, ['create']);
    await platformServer.close();
  });
});
