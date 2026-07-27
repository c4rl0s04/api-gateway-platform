import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTrustBundle,
  createManagedAuthority,
  downloadExternalCertificateRevocationList,
  generateCertificateRevocationList,
  validateCertificateRevocationList,
} from '../src/index.js';

describe('trust bundles and certificate revocation lists', () => {
  it('generates and validates a signed CRL', async () => {
    const authority = await createManagedAuthority({
      commonName: 'crl-authority',
      validityDays: 365,
    });
    const crl = await generateCertificateRevocationList({
      authorityCertificatePem: authority.certificatePem,
      authorityPrivateKeyPem: authority.privateKeyPem,
      revokedCertificates: [{
        serialNumber: '01ab',
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
        reason: 'keyCompromise',
      }],
    });

    assert.match(crl.pem, /BEGIN X509 CRL/);
    assert.equal(crl.issuer, authority.subject);
    assert.ok(crl.nextUpdate > crl.lastUpdate);

    const validated = await validateCertificateRevocationList({
      crl: crl.pem,
      authorityCertificatePem: authority.certificatePem,
    });
    assert.equal(validated.issuer, authority.subject);
  });

  it('builds deterministic bundles and rejects expired CRLs', async () => {
    const first = await createManagedAuthority({
      commonName: 'bundle-first',
      validityDays: 365,
    });
    const second = await createManagedAuthority({
      commonName: 'bundle-second',
      validityDays: 365,
    });
    const bundle = buildTrustBundle([
      {
        id: 'second',
        certificatePem: second.certificatePem,
        status: 'retiring',
      },
      {
        id: 'first',
        certificatePem: first.certificatePem,
        status: 'active',
      },
    ]);
    assert.equal(bundle.caBundlePem.indexOf(first.certificatePem.trim()), 0);
    assert.equal(
      bundle.caBundlePem.match(/BEGIN CERTIFICATE/g)?.length,
      2,
    );
    assert.throws(() => buildTrustBundle([{
      id: 'expired-crl',
      certificatePem: first.certificatePem,
      status: 'active',
      crlPem: 'invalid-but-expired-first',
      crlNextUpdate: new Date(0),
    }]), /expired CRL/);
  });

  it('requires HTTPS and validates downloaded CRLs', async () => {
    const authority = await createManagedAuthority({
      commonName: 'external-crl-authority',
      validityDays: 365,
    });
    const crl = await generateCertificateRevocationList({
      authorityCertificatePem: authority.certificatePem,
      authorityPrivateKeyPem: authority.privateKeyPem,
      revokedCertificates: [],
    });
    await assert.rejects(() => downloadExternalCertificateRevocationList({
      url: 'http://example.test/ca.crl',
      authorityCertificatePem: authority.certificatePem,
    }), /must use HTTPS/);

    const downloaded = await downloadExternalCertificateRevocationList({
      url: 'https://example.test/ca.crl',
      authorityCertificatePem: authority.certificatePem,
      fetchImpl: async () => new Response(crl.pem, { status: 200 }),
    });
    assert.equal(downloaded.issuer, authority.subject);
  });
});
