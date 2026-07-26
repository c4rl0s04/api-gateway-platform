import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hashConsumerSecret,
  normalizeCertificateFingerprint,
  verifyConsumerSecret,
} from '../src/credentials.js';

describe('credential material', () => {
  it('hashes consumer secrets with random salts and compares them safely', async () => {
    const secret = 'a-development-secret-with-at-least-32-characters';
    const first = await hashConsumerSecret(secret);
    const second = await hashConsumerSecret(secret);

    assert.notEqual(first, second);
    assert.equal(await verifyConsumerSecret(secret, first), true);
    assert.equal(await verifyConsumerSecret('incorrect-secret-value-1234567890', first), false);
    assert.equal(await verifyConsumerSecret(secret, 'invalid-hash'), false);
  });

  it('normalizes valid SHA-256 certificate fingerprints', () => {
    const colonSeparated = Array.from({ length: 32 }, () => 'AB').join(':');
    assert.equal(
      normalizeCertificateFingerprint(colonSeparated),
      'ab'.repeat(32),
    );
    assert.throws(() => normalizeCertificateFingerprint('not-a-fingerprint'));
  });
});
