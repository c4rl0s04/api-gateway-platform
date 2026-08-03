import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../src/server.js';
import { AuditService, type AuditOperations } from '../src/services/audit.js';
import type { ManagementEnv } from '../src/config/env.js';

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

describe('audit management API', () => {
  it('rejects cross-organization audit reads before querying persistence', async () => {
    const service = new AuditService();
    await assert.rejects(
      service.list({ organizationId: 'org-b', limit: 50 }, {
        issuer: config.OIDC_ISSUER,
        subject: 'viewer',
        memberships: [{
          id: 'membership-viewer',
          role: 'viewer',
          organizationId: 'org-a',
          active: true,
        }],
      }),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
  });

  it('exposes filtered cursor pagination with a bounded limit', async () => {
    const calls: unknown[] = [];
    const audit: AuditOperations = {
      list: async query => {
        calls.push(query);
        return { items: [], nextCursor: null };
      },
    };
    const server = buildServer({
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
      audit,
    });
    const response = await server.inject({
      method: 'GET',
      url: '/v1/audit-events?organizationId=org-a&action=credential.update&limit=25',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [{
      organizationId: 'org-a',
      action: 'credential.update',
      limit: 25,
    }]);
    const invalid = await server.inject({
      method: 'GET',
      url: '/v1/audit-events?limit=201',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(invalid.statusCode, 400);
    await server.close();
  });
});
