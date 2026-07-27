import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCodeChallenge, randomUrlSafe } from '../lib/oidc.js';

describe('OIDC PKCE helpers', () => {
  it('creates RFC 7636 S256 challenges', () => {
    assert.equal(
      createCodeChallenge(
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      ),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('creates non-repeating URL-safe state values', () => {
    const first = randomUrlSafe();
    const second = randomUrlSafe();
    assert.notEqual(first, second);
    assert.match(first, /^[A-Za-z0-9_-]+$/);
  });
});
