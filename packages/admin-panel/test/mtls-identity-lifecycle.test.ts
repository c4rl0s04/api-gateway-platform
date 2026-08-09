import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  certificateState,
  createMtlsIdentityName,
} from '../lib/mtls-identity-lifecycle.js';

describe('lab mTLS identity lifecycle', () => {
  it('creates distinct bounded names for identities of the same credential', () => {
    const first = createMtlsIdentityName(
      'credential-12345678',
      'aaaaaaaa-1111-2222-3333-444444444444',
    );
    const second = createMtlsIdentityName(
      'credential-12345678',
      'bbbbbbbb-1111-2222-3333-444444444444',
    );

    assert.equal(first, 'lab-credenti-aaaaaaaa');
    assert.equal(second, 'lab-credenti-bbbbbbbb');
    assert.notEqual(first, second);
  });

  it('distinguishes active, expired, revoked, and missing certificates', () => {
    const now = Date.parse('2026-08-10T10:00:00.000Z');

    assert.equal(certificateState(undefined, now), 'missing');
    assert.equal(certificateState({ status: 'pending', expiresAt: '2026-08-11T10:00:00.000Z' }, now), 'missing');
    assert.equal(certificateState({ status: 'approved', expiresAt: '2026-08-11T10:00:00.000Z' }, now), 'active');
    assert.equal(certificateState({ status: 'approved', expiresAt: '2026-08-09T10:00:00.000Z' }, now), 'expired');
    assert.equal(certificateState({ status: 'revoked', expiresAt: '2026-08-11T10:00:00.000Z' }, now), 'revoked');
  });
});
