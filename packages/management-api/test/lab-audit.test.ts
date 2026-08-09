import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { LabAuditOperations } from '../src/services/lab-audit.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1', PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform', OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/pki', PKI_MASTER_KEY_FILE: '/tmp/master',
  PKI_TRUST_BUNDLE_FILE: '/tmp/trust', PKI_CRL_BUNDLE_FILE: '/tmp/crl', PKI_SDS_TRIGGER_FILE: '/tmp/sds',
};

describe('lab audit routes', () => {
  it('does not expose organization or workspace filters', async () => {
    let query: unknown;
    const audit: LabAuditOperations = {
      list: async input => { query = input; return { items: [], nextCursor: null }; },
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labAudit: audit,
    });
    const valid = await server.inject({
      method: 'GET',
      url: '/lab/v1/audit-events?action=proxy.create&limit=20',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(query, { action: 'proxy.create', limit: 20 });
    const rejected = await server.inject({
      method: 'GET',
      url: '/lab/v1/audit-events?organizationId=foreign',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(rejected.statusCode, 400);
    await server.close();
  });
});
