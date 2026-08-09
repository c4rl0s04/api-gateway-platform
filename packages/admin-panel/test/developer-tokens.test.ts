import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canIssueDeveloperToken } from '../lib/developer-tokens.js';

describe('developer token UI permissions', () => {
  it('allows platform admins and the matching organization admin', () => {
    assert.equal(canIssueDeveloperToken({
      issuer: 'issuer',
      subject: 'platform',
      memberships: [{ role: 'platformAdmin', organizationId: null, active: true }],
    }, 'org-a'), true);
    assert.equal(canIssueDeveloperToken({
      issuer: 'issuer',
      subject: 'organization',
      memberships: [{ role: 'organizationAdmin', organizationId: 'org-a', active: true }],
    }, 'org-a'), true);
  });

  it('rejects viewers, inactive memberships, and another organization', () => {
    assert.equal(canIssueDeveloperToken({
      issuer: 'issuer',
      subject: 'viewer',
      memberships: [{ role: 'viewer', organizationId: 'org-a', active: true }],
    }, 'org-a'), false);
    assert.equal(canIssueDeveloperToken({
      issuer: 'issuer',
      subject: 'inactive',
      memberships: [{ role: 'platformAdmin', organizationId: null, active: false }],
    }, 'org-a'), false);
    assert.equal(canIssueDeveloperToken({
      issuer: 'issuer',
      subject: 'other-org',
      memberships: [{ role: 'organizationAdmin', organizationId: 'org-b', active: true }],
    }, 'org-a'), false);
  });
});
