import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProductService } from '../src/services/products.js';
import { buildServer } from '../src/server.js';
import type { ManagementEnv } from '../src/config/env.js';
import type { ProductOperations } from '../src/services/products.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1',
  PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  OIDC_ISSUER: 'https://identity.test/realms/platform',
  OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys',
  PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust-bundle.pem',
  PKI_CRL_BUNDLE_FILE: '/tmp/test-crl-bundle.pem',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-client-validation.yaml',
};

function authenticatedServer(products: ProductOperations) {
  return buildServer({
    config,
    logger: false,
    verifier: {
      verify: async () => ({
        issuer: config.OIDC_ISSUER,
        subject: 'organization-admin',
        claims: {},
      }),
    },
    memberships: {
      findActive: async () => [{
        id: 'membership-org',
        role: 'organizationAdmin',
        organizationId: 'org-a',
        active: true,
      }],
    },
    products,
  });
}

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

  it('exposes organization product lists and product details', async () => {
    const calls: string[] = [];
    const operations: ProductOperations = {
      list: async organizationId => {
        calls.push(`list:${organizationId}`);
        return [{ id: 'product-a' }];
      },
      get: async productId => {
        calls.push(`get:${productId}`);
        return { id: productId };
      },
      create: async () => ({ id: 'product-created' }),
      update: async () => ({ id: 'product-updated' }),
    };
    const server = authenticatedServer(operations);
    const list = await server.inject({
      method: 'GET',
      url: '/v1/organizations/org-a/products',
      headers: { authorization: 'Bearer token' },
    });
    const detail = await server.inject({
      method: 'GET',
      url: '/v1/products/product-a',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(list.statusCode, 200);
    assert.equal(detail.statusCode, 200);
    assert.deepEqual(calls, ['list:org-a', 'get:product-a']);
    await server.close();
  });

  it('creates and updates products with explicit relationship replacement', async () => {
    const calls: Array<{ operation: string; input: unknown }> = [];
    const operations: ProductOperations = {
      list: async () => [],
      get: async productId => ({ id: productId }),
      create: async (_organizationId, input) => {
        calls.push({ operation: 'create', input });
        return { id: 'product-a', ...input };
      },
      update: async (_productId, input) => {
        calls.push({ operation: 'update', input });
        return { id: 'product-a', ...input };
      },
    };
    const server = authenticatedServer(operations);
    const created = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/products',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Banking APIs',
        scopes: ['banking:read'],
        proxyIds: ['proxy-banking'],
      },
    });
    assert.equal(created.statusCode, 201);
    const updated = await server.inject({
      method: 'PATCH',
      url: '/v1/products/product-a',
      headers: { authorization: 'Bearer token' },
      payload: {
        scopes: ['banking:read', 'banking:write'],
        environmentIds: ['env-qual-es'],
      },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(calls, [
      {
        operation: 'create',
        input: {
          name: 'Banking APIs',
          scopes: ['banking:read'],
          proxyIds: ['proxy-banking'],
          environmentIds: [],
          active: true,
        },
      },
      {
        operation: 'update',
        input: {
          scopes: ['banking:read', 'banking:write'],
          environmentIds: ['env-qual-es'],
        },
      },
    ]);

    const duplicate = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/products',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Invalid',
        proxyIds: ['proxy-banking', 'proxy-banking'],
      },
    });
    assert.equal(duplicate.statusCode, 400);
    assert.equal(calls.length, 2);
    await server.close();
  });
});
