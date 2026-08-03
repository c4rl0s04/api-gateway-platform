import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrganizationService } from '../src/services/organizations.js';
import { buildServer } from '../src/server.js';
import type { ManagementEnv } from '../src/config/env.js';
import type { OrganizationOperations } from '../src/services/organizations.js';

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

function authenticatedServer(organizations: OrganizationOperations) {
  return buildServer({
    config,
    logger: false,
    verifier: {
      verify: async () => ({
        issuer: config.OIDC_ISSUER,
        subject: 'platform-admin',
        claims: {},
      }),
    },
    memberships: {
      findActive: async () => [{
        id: 'membership-platform',
        role: 'platformAdmin',
        organizationId: null,
        active: true,
      }],
    },
    organizations,
  });
}

describe('organization management domain', () => {
  it('rejects organization mutations before persistence for non-platform actors', async () => {
    const service = new OrganizationService();
    const actor = {
      issuer: 'https://identity.test',
      subject: 'organization-admin',
      memberships: [{
        id: 'membership-1',
        role: 'organizationAdmin' as const,
        organizationId: 'org-a',
        active: true,
      }],
    };
    await assert.rejects(
      service.create({ name: 'Denied' }, actor),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
    await assert.rejects(
      service.update('org-a', { name: 'Denied' }, actor),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
  });

  it('exposes organization reads and mutations with strict payloads', async () => {
    const calls: string[] = [];
    const operations: OrganizationOperations = {
      list: async () => [{ id: 'org-a', name: 'Organization A' }],
      get: async id => ({ id, name: 'Organization A' }),
      create: async input => {
        calls.push(`create:${input.name}`);
        return { id: 'org-new', name: input.name };
      },
      update: async (id, input) => {
        calls.push(`update:${id}:${input.name}`);
        return { id, name: input.name };
      },
    };
    const server = authenticatedServer(operations);
    const listed = await server.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(listed.statusCode, 200);
    const created = await server.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'New organization' },
    });
    assert.equal(created.statusCode, 201);
    const updated = await server.inject({
      method: 'PATCH',
      url: '/v1/organizations/org-new',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Renamed organization' },
    });
    assert.equal(updated.statusCode, 200);
    const invalid = await server.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Invalid', active: true },
    });
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual(calls, [
      'create:New organization',
      'update:org-new:Renamed organization',
    ]);
    await server.close();
  });
});
