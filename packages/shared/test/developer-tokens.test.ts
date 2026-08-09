import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEVELOPER_TOKEN_GRANT_TYPE,
  developerTokenRequestSchema,
} from '../src/index.js';

describe('developer token contracts', () => {
  it('accepts a bounded multi-proxy request and applies the default TTL', () => {
    const parsed = developerTokenRequestSchema.parse({
      environmentId: 'env-qual-es',
      productIds: ['product-banking'],
      proxyIds: ['proxy-accounts', 'proxy-payments'],
      scopes: ['banking:read'],
    });

    assert.equal(parsed.ttlSeconds, 600);
    assert.equal(
      DEVELOPER_TOKEN_GRANT_TYPE,
      'urn:api-gateway:params:oauth:grant-type:developer-token',
    );
  });

  it('rejects duplicate resources and TTLs above fifteen minutes', () => {
    assert.equal(developerTokenRequestSchema.safeParse({
      environmentId: 'env-qual-es',
      productIds: ['product-banking'],
      proxyIds: ['proxy-accounts', 'proxy-accounts'],
      scopes: ['banking:read'],
      ttlSeconds: 901,
    }).success, false);
  });
});
