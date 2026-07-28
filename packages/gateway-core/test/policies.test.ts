import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApiKeyPolicyWithDependencies } from '../src/policies/auth/api-key.policy';
import { createRateLimitPolicyWithClient } from '../src/policies/rate-limit/rate-limit.policy';
import { createPolicyContext } from './test-helpers';

describe('policy failure modes', () => {
  it('keeps normal API key denials separate from infrastructure failures', async () => {
    let queries = 0;
    const missingKeyContext = createPolicyContext();
    const policy = createApiKeyPolicyWithDependencies(
      { header: 'x-api-key', failureMode: 'open' },
      {
        findCredential: async () => {
          queries += 1;
          return null;
        },
      },
    );

    const missingKey = await policy(missingKeyContext.context);
    assert.equal(missingKey.action, 'halt');
    assert.equal(missingKey.action === 'halt' && missingKey.statusCode, 401);
    assert.equal(queries, 0);

    const invalidKeyContext = createPolicyContext({
      headers: { 'x-api-key': 'invalid' },
    });
    const invalidKey = await policy(invalidKeyContext.context);
    assert.equal(invalidKey.action, 'halt');
    assert.equal(invalidKey.action === 'halt' && invalidKey.statusCode, 401);
    assert.equal(queries, 1);
  });

  it('authorizes a credential and populates downstream client context', async () => {
    const { context } = createPolicyContext({
      headers: { 'x-api-key': 'valid-key' },
    });
    const policy = createApiKeyPolicyWithDependencies(
      { header: 'x-api-key', failureMode: 'closed' },
      {
        findCredential: async () => ({
          id: 'credential-1',
          consumerKey: 'valid-key',
          consumerSecretHash: 'stored-hash',
          status: 'approved',
          issuedAt: new Date(0),
          expiresAt: null,
          appId: 'app-1',
          app: { organizationId: 'org-1', status: 'approved' },
          productGrants: [{
            status: 'approved',
            scopes: ['read'],
            product: {
              id: 'product-1',
              organizationId: 'org-1',
              active: true,
              scopes: ['read'],
              proxies: [{ id: 'proxy-test' }],
              environments: [],
            },
          }],
        }),
      },
    );

    assert.deepEqual(await policy(context), { action: 'continue' });
    assert.deepEqual(context.client, {
      appId: 'app-1',
      credentialId: 'credential-1',
      consumerKey: 'valid-key',
      organizationId: 'org-1',
      productIds: ['product-1'],
      scopes: ['read'],
    });
  });

  it('authorizes a product restricted to the current environment', async () => {
    const { context } = createPolicyContext({
      headers: { 'x-api-key': 'restricted-key' },
    });
    const policy = createApiKeyPolicyWithDependencies(
      { header: 'x-api-key', failureMode: 'closed' },
      {
        findCredential: async () => ({
          id: 'credential-1',
          consumerKey: 'restricted-key',
          consumerSecretHash: 'stored-hash',
          status: 'approved',
          issuedAt: new Date(0),
          expiresAt: null,
          appId: 'app-1',
          app: { organizationId: 'org-1', status: 'approved' },
          productGrants: [{
            status: 'approved',
            scopes: [],
            product: {
              id: 'product-qual-es',
              organizationId: 'org-1',
              active: true,
              scopes: [],
              proxies: [{ id: 'proxy-test' }],
              environments: [{ id: 'env-qual-es' }],
            },
          }],
        }),
      },
    );

    assert.deepEqual(await policy(context), { action: 'continue' });
    assert.deepEqual(context.client?.productIds, ['product-qual-es']);
  });

  it('rejects a product restricted to another environment', async () => {
    const { context } = createPolicyContext({
      headers: { 'x-api-key': 'restricted-key' },
    });
    const policy = createApiKeyPolicyWithDependencies(
      { header: 'x-api-key', failureMode: 'closed' },
      {
        findCredential: async () => ({
          id: 'credential-1',
          consumerKey: 'restricted-key',
          consumerSecretHash: 'stored-hash',
          status: 'approved',
          issuedAt: new Date(0),
          expiresAt: null,
          appId: 'app-1',
          app: { organizationId: 'org-1', status: 'approved' },
          productGrants: [{
            status: 'approved',
            scopes: [],
            product: {
              id: 'product-prod-es',
              organizationId: 'org-1',
              active: true,
              scopes: [],
              proxies: [{ id: 'proxy-test' }],
              environments: [{ id: 'env-prod-es' }],
            },
          }],
        }),
      },
    );

    const result = await policy(context);

    assert.equal(result.action, 'halt');
    assert.equal(result.action === 'halt' && result.statusCode, 403);
    assert.equal(context.client, undefined);
  });

  it('fails closed when the API key database is unavailable', async () => {
    const { context } = createPolicyContext({
      headers: { 'x-api-key': 'key-123' },
    });
    const policy = createApiKeyPolicyWithDependencies(
      { header: 'x-api-key', failureMode: 'closed' },
      { findCredential: async () => { throw new Error('database down'); } },
    );

    const result = await policy(context);

    assert.equal(result.action, 'halt');
    assert.equal(result.action === 'halt' && result.statusCode, 503);
    assert.equal(context.state['api-key-auth.degraded'], true);
  });

  it('fails open when the API key policy explicitly allows it', async () => {
    const { context } = createPolicyContext({
      headers: { 'x-api-key': 'key-123' },
    });
    const policy = createApiKeyPolicyWithDependencies(
      { header: 'x-api-key', failureMode: 'open' },
      { findCredential: async () => { throw new Error('database down'); } },
    );

    assert.deepEqual(await policy(context), { action: 'continue' });
  });

  it('applies open and closed behavior when Redis is unavailable', async () => {
    const unavailable = () => ({
      eval: async () => { throw new Error('redis down'); },
    });

    const openContext = createPolicyContext();
    const openPolicy = createRateLimitPolicyWithClient(
      { limit: 10, windowSeconds: 60, failureMode: 'open' },
      unavailable,
    );
    assert.deepEqual(await openPolicy(openContext.context), { action: 'continue' });
    assert.equal(
      openContext.responseHeaders.get('x-ratelimit-policy'),
      'degraded',
    );

    const closedContext = createPolicyContext();
    const closedPolicy = createRateLimitPolicyWithClient(
      { limit: 10, windowSeconds: 60, failureMode: 'closed' },
      unavailable,
    );
    const result = await closedPolicy(closedContext.context);
    assert.equal(result.action, 'halt');
    assert.equal(result.action === 'halt' && result.statusCode, 503);
  });

  it('returns 429 and retry headers when the limit is exceeded', async () => {
    const { context, responseHeaders } = createPolicyContext();
    let redisKey = '';
    const policy = createRateLimitPolicyWithClient(
      { limit: 5, windowSeconds: 60, failureMode: 'closed' },
      () => ({
        eval: async (_script, _numberOfKeys, key) => {
          redisKey = String(key);
          return [1, 23];
        },
      }),
    );

    const result = await policy(context);

    assert.equal(result.action, 'halt');
    assert.equal(result.action === 'halt' && result.statusCode, 429);
    assert.equal(responseHeaders.get('retry-after'), '23');
    assert.equal(responseHeaders.get('x-ratelimit-remaining'), '0');
    assert.match(
      redisKey,
      /^ratelimit:env-qual-es:127\.0\.0\.1:proxy-test:\d+$/,
    );
  });

  it('rejects invalid rate-limit configuration before execution', () => {
    assert.throws(
      () => createRateLimitPolicyWithClient(
        { limit: 0, windowSeconds: 60, failureMode: 'closed' },
        () => ({ eval: async () => [0, 0] }),
      ),
      /greater than 0/,
    );
  });
});
