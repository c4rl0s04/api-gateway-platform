import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { LabCertificateOperations } from '../src/services/lab-certificates.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1', PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test', REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform', OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/pki', PKI_MASTER_KEY_FILE: '/tmp/master',
  PKI_TRUST_BUNDLE_FILE: '/tmp/trust', PKI_CRL_BUNDLE_FILE: '/tmp/crl', PKI_SDS_TRIGGER_FILE: '/tmp/sds',
};

describe('lab certificate routes', () => {
  it('issues only short-lived certificates without accepting an authority identifier', async () => {
    const calls: unknown[] = [];
    const result = async (...args: unknown[]) => { calls.push(args); return { id: 'certificate-1' }; };
    const certificates: LabCertificateOperations = {
      list: result, issue: result, download: result, revoke: result,
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'owner', claims: {} }) },
      labCertificates: certificates,
    });
    const headers = { authorization: 'Bearer token' };
    const issued = await server.inject({
      method: 'POST', url: '/lab/v1/credentials/credential-1/certificates', headers,
      payload: {
        csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nrequest\n-----END CERTIFICATE REQUEST-----',
        validityDays: 1,
      },
    });
    assert.equal(issued.statusCode, 201);
    assert.deepEqual((calls[0] as unknown[]).slice(0, 2), [
      'credential-1',
      {
        csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nrequest\n-----END CERTIFICATE REQUEST-----',
        validityDays: 1,
      },
    ]);
    const invalid = await server.inject({
      method: 'POST', url: '/lab/v1/credentials/credential-1/certificates', headers,
      payload: {
        csrPem: '-----BEGIN CERTIFICATE REQUEST-----\nrequest\n-----END CERTIFICATE REQUEST-----',
        authorityId: 'foreign',
      },
    });
    assert.equal(invalid.statusCode, 400);
    await server.close();
  });
});
