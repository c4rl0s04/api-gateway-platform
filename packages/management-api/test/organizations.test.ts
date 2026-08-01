import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrganizationService } from '../src/services/organizations.js';

describe('organization management domain', () => {
  it('rejects organization mutations before persistence for non-platform actors', async () => {
    const service = new OrganizationService();
    const actor = {
      issuer: 'https://identity.test',
      subject: 'organization-admin',
      memberships: [{
        id: 'membership-1',
        role: 'organizationAdmin' as const,
        organizationId: 'org-a',
        active: true,
      }],
    };
    await assert.rejects(
      service.create({ name: 'Denied' }, actor),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
    await assert.rejects(
      service.update('org-a', { name: 'Denied' }, actor),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
  });
});
