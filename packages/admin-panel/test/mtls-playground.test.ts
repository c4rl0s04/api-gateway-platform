import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMtlsCertificateCompatibility } from '../lib/mtls-playground.js';

const certificate = {
  fingerprintSha256: 'ab'.repeat(32),
  status: 'approved',
  validFrom: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  credential: { id: 'credential-1' },
};

describe('mTLS Playground certificate matching', () => {
  it('authorizes only an exact active fingerprint attached to an eligible credential', () => {
    const result = resolveMtlsCertificateCompatibility(
      { hasCertificate: true, certificateFingerprintSha256: 'AB:'.repeat(31) + 'AB' },
      [certificate],
      new Set(['credential-1']),
      Date.parse('2026-06-01T00:00:00.000Z'),
    );
    assert.equal(result.state, 'authorized');
    assert.equal(result.certificate, certificate);
  });

  it('distinguishes unregistered, revoked, expired, and unauthorized certificates', () => {
    const identity = { hasCertificate: true, certificateFingerprintSha256: 'ab'.repeat(32) };
    assert.equal(resolveMtlsCertificateCompatibility(identity, [], new Set()).state, 'unregistered');
    assert.equal(resolveMtlsCertificateCompatibility(
      identity, [{ ...certificate, status: 'revoked' }], new Set(['credential-1']),
    ).state, 'revoked');
    assert.equal(resolveMtlsCertificateCompatibility(
      identity, [{ ...certificate, expiresAt: '2025-01-01T00:00:00.000Z' }], new Set(['credential-1']),
    ).state, 'expired');
    assert.equal(resolveMtlsCertificateCompatibility(
      identity, [certificate], new Set(), Date.parse('2026-06-01T00:00:00.000Z'),
    ).state, 'not-authorized');
  });
});
