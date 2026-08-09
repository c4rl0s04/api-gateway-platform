import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import type { CertificateOperations } from '../src/services/certificates.js';

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

function multipart(parts: Array<{ name: string; value: string; filename?: string }>) {
  const boundary = 'certificate-upload-boundary';
  const body = parts.map(part => [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}`,
    ...(part.filename ? ['Content-Type: application/octet-stream'] : []),
    '',
    part.value,
  ].join('\r\n')).join('\r\n') + `\r\n--${boundary}--\r\n`;
  return {
    headers: {
      authorization: 'Bearer token',
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  };
}

function makeOperations(calls: Array<{ method: string; args: unknown[] }>): CertificateOperations {
  return {
    list: async (...args) => { calls.push({ method: 'list', args }); return []; },
    listCredential: async (...args) => { calls.push({ method: 'listCredential', args }); return []; },
    issue: async (...args) => { calls.push({ method: 'issue', args }); return {}; },
    registerExternal: async (...args) => { calls.push({ method: 'registerExternal', args }); return { id: 'certificate-1' }; },
    download: async (...args) => { calls.push({ method: 'download', args }); return { certificatePem: '', chainPem: null }; },
    revoke: async (...args) => { calls.push({ method: 'revoke', args }); return {}; },
    status: async (...args) => { calls.push({ method: 'status', args }); return {}; },
  };
}

function server(calls: Array<{ method: string; args: unknown[] }>) {
  return buildServer({
    config,
    logger: false,
    verifier: { verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'admin', claims: {} }) },
    memberships: { findActive: async () => [{ id: 'member', role: 'organizationAdmin', organizationId: 'org-a', active: true }] },
    certificates: makeOperations(calls),
  });
}

describe('certificate routes', () => {
  it('lists certificates for one credential', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const app = server(calls);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/credentials/credential-1/certificates',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(calls[0]?.method, 'listCredential');
    assert.equal(calls[0]?.args[0], 'credential-1');
    await app.close();
  });

  it('accepts PEM certificate uploads while preserving the JSON contract', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const app = server(calls);
    const upload = multipart([
      { name: 'authorityId', value: '11111111-1111-4111-8111-111111111111' },
      { name: 'certificate', filename: 'client.crt', value: '-----BEGIN CERTIFICATE-----\nY2VydA==\n-----END CERTIFICATE-----' },
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/credentials/credential-1/certificates/external',
      ...upload,
    });
    assert.equal(response.statusCode, 201);
    const input = calls.find(call => call.method === 'registerExternal')?.args[0] as {
      credentialId: string;
      certificatePem: string;
    };
    assert.equal(input.credentialId, 'credential-1');
    assert.match(input.certificatePem, /BEGIN CERTIFICATE/);
    await app.close();
  });

  it('normalizes DER certificate uploads to PEM', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const app = server(calls);
    const upload = multipart([
      { name: 'authorityId', value: '11111111-1111-4111-8111-111111111111' },
      { name: 'certificate', filename: 'client.der', value: 'binary-certificate' },
    ]);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/credentials/credential-1/certificates/external',
      ...upload,
    });
    assert.equal(response.statusCode, 201);
    const input = calls.find(call => call.method === 'registerExternal')?.args[0] as { certificatePem: string };
    assert.match(input.certificatePem, /^-----BEGIN CERTIFICATE-----/);
    await app.close();
  });
});
