import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProductService } from '../src/services/products.js';

describe('product management domain', () => {
  it('rejects product creation before persistence for viewers', async () => {
    const service = new ProductService();
    await assert.rejects(
      service.create('org-a', {
        name: 'Denied product',
        active: true,
        scopes: [],
        proxyIds: ['proxy-a'],
        environmentIds: [],
      }, {
        issuer: 'https://identity.test',
        subject: 'viewer',
        memberships: [{
          id: 'membership-viewer',
          role: 'viewer',
          organizationId: 'org-a',
          active: true,
        }],
      }),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
  });
});
