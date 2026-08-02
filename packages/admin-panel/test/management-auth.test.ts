import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectManagementAccessToken } from '../lib/management-auth.js';

describe('management BFF authentication', () => {
  it('prefers an explicit Bearer token for API clients', () => {
    assert.equal(
      selectManagementAccessToken('Bearer postman-token', 'browser-token'),
      'postman-token',
    );
  });

  it('uses the HttpOnly cookie when no Authorization header exists', () => {
    assert.equal(
      selectManagementAccessToken(null, 'browser-token'),
      'browser-token',
    );
  });

  it('rejects malformed explicit authorization instead of falling back', () => {
    assert.equal(
      selectManagementAccessToken('Basic credentials', 'browser-token'),
      null,
    );
    assert.equal(selectManagementAccessToken(null, undefined), null);
  });
});
