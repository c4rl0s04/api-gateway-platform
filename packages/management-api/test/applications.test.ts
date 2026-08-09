import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RegisterDeveloperApplicationError,
} from '@api-gateway/database';
import { buildServer } from '../src/server.js';
import { ApplicationService } from '../src/services/applications.js';
import type { ManagementEnv } from '../src/config/env.js';
import type {
  ApplicationOperations,
  RegisterApplicationInput,
} from '../src/services/applications.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1',
  PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform',
  OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys',
  PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust-bundle.pem',
  PKI_CRL_BUNDLE_FILE: '/tmp/test-crl-bundle.pem',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-client-validation.yaml',
};

function authenticatedServer(
  applications: ApplicationOperations,
  role: 'organizationAdmin' | 'viewer' = 'organizationAdmin',
) {
  return buildServer({
    config,
    logger: false,
    verifier: {
      verify: async () => ({
        issuer: config.OIDC_ISSUER,
        subject: 'local-admin',
        claims: {},
      }),
    },
    memberships: {
      findActive: async () => [{
        id: 'membership-1',
        role,
        organizationId: 'org-a',
        active: true,
      }],
    },
    applications,
  });
}

describe('application management API', () => {
  it('registers an app without accepting a credential method', async () => {
    const calls: Array<{
      organizationId: string;
      input: RegisterApplicationInput;
    }> = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({ id: 'app-1' }),
      register: async (organizationId, input) => {
        calls.push({ organizationId, input });
        return {
          application: { id: 'app-1', name: input.name },
          credential: { id: 'credential-1', consumerKey: 'ck_generated' },
          consumerSecret: 'cs_returned_once',
        };
      },
      update: async () => ({}),
      createCredential: async () => ({}),
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/apps',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Payments consumer',
        products: [{ productId: 'product-payments' }],
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().consumerSecret, 'cs_returned_once');
    assert.deepEqual(calls, [{
      organizationId: 'org-a',
      input: {
        name: 'Payments consumer',
        products: [{ productId: 'product-payments' }],
      },
    }]);

    const rejected = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/apps',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Invalid consumer',
        products: [{ productId: 'product-payments' }],
        authMethods: ['apiKey'],
      },
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.json().error, 'invalid_request');
    assert.equal(calls.length, 1);
    await server.close();
  });

  it('keeps organization authorization in the application service', async () => {
    const server = authenticatedServer(new ApplicationService(), 'viewer');
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/apps',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Denied app',
        products: [{ productId: 'product-payments' }],
      },
    });
    assert.equal(response.statusCode, 403);
    await server.close();
  });

  it('maps domain validation failures to stable API errors', async () => {
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({ id: 'app-1' }),
      register: async () => {
        throw new RegisterDeveloperApplicationError(
          'invalid_scope',
          'Scope is not declared by the product',
        );
      },
      update: async () => ({}),
      createCredential: async () => ({}),
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/apps',
      headers: { authorization: 'Bearer token' },
      payload: {
        name: 'Invalid scope app',
        products: [{
          productId: 'product-payments',
          scopes: ['payments:admin'],
        }],
      },
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'invalid_scope',
      message: 'Scope is not declared by the product',
    });
    await server.close();
  });

  it('updates application name and status through a strict contract', async () => {
    const calls: unknown[] = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({ id: 'app-1' }),
      register: async () => ({}),
      update: async (appId, input) => {
        calls.push({ appId, input });
        return { id: appId, ...input };
      },
      createCredential: async () => ({}),
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const response = await server.inject({
      method: 'PATCH',
      url: '/v1/apps/app-1',
      headers: { authorization: 'Bearer token' },
      payload: { name: 'Renamed app', status: 'revoked' },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [{
      appId: 'app-1',
      input: { name: 'Renamed app', status: 'revoked' },
    }]);
    const invalid = await server.inject({
      method: 'PATCH',
      url: '/v1/apps/app-1',
      headers: { authorization: 'Bearer token' },
      payload: { consumerKey: 'not-editable' },
    });
    assert.equal(invalid.statusCode, 400);
    await server.close();
  });

  it('creates an additional credential explicitly or by cloning a source', async () => {
    const calls: unknown[] = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({ id: 'app-1' }),
      register: async () => ({}),
      update: async () => ({}),
      createCredential: async (appId, input) => {
        calls.push({ appId, input });
        return {
          credential: { id: 'credential-2', consumerKey: 'ck_generated' },
          consumerSecret: 'cs_once',
        };
      },
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/apps/app-1/credentials',
      headers: { authorization: 'Bearer token' },
      payload: {
        products: [{
          productId: 'product-banking',
          scopes: ['banking:read'],
        }],
      },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().consumerSecret, 'cs_once');
    assert.deepEqual(calls, [{
      appId: 'app-1',
      input: {
        products: [{
          productId: 'product-banking',
          scopes: ['banking:read'],
        }],
      },
    }]);
    const cloned = await server.inject({
      method: 'POST',
      url: '/v1/apps/app-1/credentials',
      headers: { authorization: 'Bearer token' },
      payload: { sourceCredentialId: 'credential-1' },
    });
    assert.equal(cloned.statusCode, 201);
    assert.deepEqual(calls[1], {
      appId: 'app-1',
      input: { sourceCredentialId: 'credential-1' },
    });
    const playgroundExpiry = '2030-01-01T00:30:00.000Z';
    const playgroundClone = await server.inject({
      method: 'POST',
      url: '/v1/apps/app-1/credentials',
      headers: { authorization: 'Bearer token' },
      payload: {
        sourceCredentialId: 'credential-1',
        purpose: 'playground',
        expiresAt: playgroundExpiry,
      },
    });
    assert.equal(playgroundClone.statusCode, 201);
    assert.deepEqual(calls[2], {
      appId: 'app-1',
      input: {
        sourceCredentialId: 'credential-1',
        purpose: 'playground',
        expiresAt: new Date(playgroundExpiry),
      },
    });
    const missingProducts = await server.inject({
      method: 'POST',
      url: '/v1/apps/app-1/credentials',
      headers: { authorization: 'Bearer token' },
      payload: {},
    });
    assert.equal(missingProducts.statusCode, 400);
    assert.equal(calls.length, 3);
    await server.close();
  });

  it('reads and updates credential lifecycle fields without exposing secret data', async () => {
    const calls: unknown[] = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({}),
      register: async () => ({}),
      update: async () => ({}),
      createCredential: async () => ({}),
      getCredential: async credentialId => ({
        id: credentialId,
        consumerKey: 'ck_public',
      }),
      updateCredential: async (credentialId, input) => {
        calls.push({ credentialId, input });
        return { id: credentialId, ...input };
      },
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const detail = await server.inject({
      method: 'GET',
      url: '/v1/credentials/credential-1',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().consumerKey, 'ck_public');
    const updated = await server.inject({
      method: 'PATCH',
      url: '/v1/credentials/credential-1',
      headers: { authorization: 'Bearer token' },
      payload: { expiresAt: null, status: 'revoked' },
    });
    assert.equal(updated.statusCode, 200);
    assert.deepEqual(calls, [{
      credentialId: 'credential-1',
      input: { expiresAt: null, status: 'revoked' },
    }]);
    const consumerKeyChange = await server.inject({
      method: 'PATCH',
      url: '/v1/credentials/credential-1',
      headers: { authorization: 'Bearer token' },
      payload: { consumerKey: 'replacement' },
    });
    assert.equal(consumerKeyChange.statusCode, 200);
    assert.deepEqual(calls[1], {
      credentialId: 'credential-1',
      input: { consumerKey: 'replacement' },
    });
    const invalidConsumerKey = await server.inject({
      method: 'PATCH',
      url: '/v1/credentials/credential-1',
      headers: { authorization: 'Bearer token' },
      payload: { consumerKey: 'invalid:key' },
    });
    assert.equal(invalidConsumerKey.statusCode, 400);
    await server.close();
  });

  it('rotates a consumer secret through a one-time response', async () => {
    const calls: string[] = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({}),
      register: async () => ({}),
      update: async () => ({}),
      createCredential: async () => ({}),
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async credentialId => {
        calls.push(credentialId);
        return { consumerSecret: 'cs_rotated_once' };
      },
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const response = await server.inject({
      method: 'POST',
      url: '/v1/credentials/credential-1/rotate-secret',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().consumerSecret, 'cs_rotated_once');
    assert.deepEqual(calls, ['credential-1']);
    await server.close();
  });

  it('replaces the complete credential product grant set', async () => {
    const calls: unknown[] = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({}),
      register: async () => ({}),
      update: async () => ({}),
      createCredential: async () => ({}),
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async (credentialId, input) => {
        calls.push({ credentialId, input });
        return [{ productId: input.products[0]?.productId, status: 'approved' }];
      },
      listPublicKeys: async () => [],
      registerPublicKey: async () => ({}),
      revokePublicKey: async () => ({}),
    };
    const server = authenticatedServer(applications);
    const response = await server.inject({
      method: 'PUT',
      url: '/v1/credentials/credential-1/product-grants',
      headers: { authorization: 'Bearer token' },
      payload: {
        products: [{ productId: 'product-banking', scopes: ['banking:read'] }],
      },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls, [{
      credentialId: 'credential-1',
      input: {
        products: [{
          productId: 'product-banking',
          scopes: ['banking:read'],
        }],
      },
    }]);
    const duplicate = await server.inject({
      method: 'PUT',
      url: '/v1/credentials/credential-1/product-grants',
      headers: { authorization: 'Bearer token' },
      payload: {
        products: [
          { productId: 'product-banking' },
          { productId: 'product-banking' },
        ],
      },
    });
    assert.equal(duplicate.statusCode, 400);
    assert.equal(calls.length, 1);
    await server.close();
  });

  it('lists, registers, and revokes RSA public keys', async () => {
    const calls: string[] = [];
    const applications: ApplicationOperations = {
      list: async () => [],
      get: async () => ({}),
      register: async () => ({}),
      update: async () => ({}),
      createCredential: async () => ({}),
      getCredential: async () => ({}),
      updateCredential: async () => ({}),
      rotateCredential: async () => ({}),
      replaceCredentialGrants: async () => ({}),
      listPublicKeys: async credentialId => [{ id: `key-${credentialId}` }],
      registerPublicKey: async (credentialId, input) => {
        calls.push(`register:${credentialId}:${input.kid}`);
        return { id: 'key-1', credentialId, ...input };
      },
      revokePublicKey: async publicKeyId => {
        calls.push(`revoke:${publicKeyId}`);
        return { id: publicKeyId, status: 'revoked' };
      },
    };
    const server = authenticatedServer(applications);
    const listed = await server.inject({
      method: 'GET',
      url: '/v1/credentials/credential-1/public-keys',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(listed.statusCode, 200);
    const registered = await server.inject({
      method: 'POST',
      url: '/v1/credentials/credential-1/public-keys',
      headers: { authorization: 'Bearer token' },
      payload: {
        kid: 'client-key-2026',
        jwk: { kty: 'RSA', n: 'public-modulus', e: 'AQAB' },
      },
    });
    assert.equal(registered.statusCode, 201);
    const revoked = await server.inject({
      method: 'POST',
      url: '/v1/public-keys/key-1/revoke',
      headers: { authorization: 'Bearer token' },
    });
    assert.equal(revoked.statusCode, 200);
    assert.deepEqual(calls, [
      'register:credential-1:client-key-2026',
      'revoke:key-1',
    ]);
    await server.close();
  });
});
