import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { SignJWT } from 'jose';
import type { AdminRole } from '@api-gateway/database';
import { createOidcVerifier } from '../src/auth/oidc.js';
import {
  canManageOrganization,
  canReadOrganization,
  type AdminPrincipal,
} from '../src/auth/authorization.js';

const issuer = 'https://identity.test/realms/platform';
const audience = 'management-api';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

async function token(overrides: {
  issuer?: string;
  audience?: string;
  expiration?: number;
} = {}): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(overrides.issuer ?? issuer)
    .setSubject('admin-user')
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(overrides.expiration ?? '5m')
    .sign(privateKey);
}

function principal(
  role: AdminRole,
  organizationId: string | null,
): AdminPrincipal {
  return {
    issuer,
    subject: 'admin-user',
    memberships: [{
      id: 'membership-1',
      role,
      organizationId,
      active: true,
    }],
  };
}

describe('management OIDC authentication and authorization', () => {
  it('validates RS256 issuer, audience, and expiration', async () => {
    const verifier = createOidcVerifier({
      issuer,
      audience,
      keyResolver: async () => publicKey,
    });
    assert.equal((await verifier.verify(await token())).subject, 'admin-user');
    await assert.rejects(async () => verifier.verify(await token({
      issuer: 'https://wrong.test',
    })));
    await assert.rejects(async () => verifier.verify(await token({
      audience: 'wrong-audience',
    })));
    await assert.rejects(async () => verifier.verify(await token({
      expiration: Math.floor(Date.now() / 1000) - 1,
    })));
  });

  it('enforces platform and organization role boundaries', () => {
    const platformAdmin = principal('platformAdmin', null);
    const organizationAdmin = principal('organizationAdmin', 'org-a');
    const viewer = principal('viewer', 'org-a');

    assert.equal(canManageOrganization(platformAdmin, 'org-b'), true);
    assert.equal(canManageOrganization(organizationAdmin, 'org-a'), true);
    assert.equal(canManageOrganization(organizationAdmin, 'org-b'), false);
    assert.equal(canReadOrganization(viewer, 'org-a'), true);
    assert.equal(canManageOrganization(viewer, 'org-a'), false);
  });
});
