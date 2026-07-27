import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createClientCertificateRequest,
  createManagedAuthority,
  issueClientCertificate,
  issueServerCertificate,
  validateExternalClientCertificate,
} from '../src/x509.js';

describe('X.509 certificate lifecycle', () => {
  it('issues a constrained client certificate from an RSA CSR', async () => {
    const authority = await createManagedAuthority({
      commonName: 'test-authority',
      validityDays: 365,
    });
    const request = await createClientCertificateRequest({
      credentialId: 'credential-one',
    });
    const certificate = await issueClientCertificate({
      csrPem: request.csrPem,
      authorityCertificatePem: authority.certificatePem,
      authorityPrivateKeyPem: authority.privateKeyPem,
      organizationId: 'organization-one',
      appId: 'application-one',
      credentialId: 'credential-one',
      validityDays: 30,
    });

    assert.equal(authority.isCertificateAuthority, true);
    assert.equal(certificate.isCertificateAuthority, false);
    assert.equal(certificate.fingerprintSha256.length, 64);
    assert.match(certificate.subject, /CN=credential-one/);
    assert.equal(certificate.issuer, authority.subject);
    assert.ok(certificate.expiresAt > certificate.validFrom);

    const external = await validateExternalClientCertificate({
      certificatePem: certificate.certificatePem,
      authorityCertificatePem: authority.certificatePem,
    });
    assert.equal(external.fingerprintSha256, certificate.fingerprintSha256);
  });

  it('supports P-256 client CSRs', async () => {
    const authority = await createManagedAuthority({
      commonName: 'ec-test-authority',
      validityDays: 365,
    });
    const request = await createClientCertificateRequest({
      credentialId: 'credential-ec',
      algorithm: 'ec',
    });
    const certificate = await issueClientCertificate({
      csrPem: request.csrPem,
      authorityCertificatePem: authority.certificatePem,
      authorityPrivateKeyPem: authority.privateKeyPem,
      organizationId: 'organization-one',
      appId: 'application-one',
      credentialId: 'credential-ec',
    });
    assert.equal(certificate.isCertificateAuthority, false);
  });

  it('issues a localhost server certificate with a closed profile', async () => {
    const authority = await createManagedAuthority({
      commonName: 'server-test-authority',
      validityDays: 365,
    });
    const request = await createClientCertificateRequest({
      credentialId: 'localhost',
    });
    const certificate = await issueServerCertificate({
      csrPem: request.csrPem,
      authorityCertificatePem: authority.certificatePem,
      authorityPrivateKeyPem: authority.privateKeyPem,
      dnsNames: ['localhost'],
      ipAddresses: ['127.0.0.1'],
    });
    assert.equal(certificate.isCertificateAuthority, false);
  });

  it('rejects invalid validity periods and untrusted certificates', async () => {
    const first = await createManagedAuthority({
      commonName: 'first-authority',
      validityDays: 365,
    });
    const second = await createManagedAuthority({
      commonName: 'second-authority',
      validityDays: 365,
    });
    const request = await createClientCertificateRequest({
      credentialId: 'credential-two',
    });
    await assert.rejects(() => issueClientCertificate({
      csrPem: request.csrPem,
      authorityCertificatePem: first.certificatePem,
      authorityPrivateKeyPem: first.privateKeyPem,
      organizationId: 'organization-one',
      appId: 'application-one',
      credentialId: 'credential-two',
      validityDays: 366,
    }));
    const certificate = await issueClientCertificate({
      csrPem: request.csrPem,
      authorityCertificatePem: first.certificatePem,
      authorityPrivateKeyPem: first.privateKeyPem,
      organizationId: 'organization-one',
      appId: 'application-one',
      credentialId: 'credential-two',
    });
    await assert.rejects(() => validateExternalClientCertificate({
      certificatePem: certificate.certificatePem,
      authorityCertificatePem: second.certificatePem,
    }));
  });
});
