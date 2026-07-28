import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { before, describe, it } from 'node:test';
import { exportJWK, importPKCS8, jwtVerify, SignJWT } from 'jose';
import type { GatewayEnv } from '../src/config/env.js';
import {
  authorizedProducts,
  isCredentialValid,
} from '../src/auth/authorization.js';
import { configureOAuthRuntime } from '../src/oauth/runtime.js';
import { createMtlsPolicyWithDependencies } from '../src/policies/auth/mtls.policy.js';
import { createOAuthAccessTokenPolicy } from '../src/policies/oauth/oauth-access-token.policy.js';
import { createOAuthTokenPolicyWithDependencies } from '../src/policies/oauth/oauth-token.policy.js';
import { buildServer } from '../src/server.js';
import { createPolicyContext, TEST_ENV } from './test-helpers.js';

const gatewayPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const gatewayPrivatePem = gatewayPair.privateKey.export({
  format: 'pem',
  type: 'pkcs8',
}).toString();
const AUTH_ENV: GatewayEnv = {
  ...TEST_ENV,
  OAUTH_ISSUER: 'https://gateway.test',
  OAUTH_TOKEN_ENDPOINT_AUDIENCE: 'https://gateway.test/oauth/token',
  OAUTH_SIGNING_PRIVATE_KEY_BASE64: Buffer.from(gatewayPrivatePem).toString('base64'),
  OAUTH_SIGNING_KEY_ID: 'gateway-test-1',
  MTLS_TRUSTED_PROXY_CIDRS: '127.0.0.0/8,10.0.0.0/8',
};

function credential() {
  return {
    id: 'credential-1',
    appId: 'app-1',
    consumerKey: 'client-1',
    consumerSecretHash: 'stored-hash',
    status: 'approved',
    issuedAt: new Date(0),
    expiresAt: null,
    app: { status: 'approved', organizationId: 'org-test' },
    productGrants: [{
      status: 'approved',
      scopes: ['accounts:read'],
      product: {
        id: 'product-1',
        organizationId: 'org-test',
        active: true,
        scopes: ['accounts:read'],
        proxies: [{ id: 'proxy-test' }],
        environments: [],
      },
    }],
  };
}

const tokenConfig = {
  failureMode: 'closed' as const,
  grantTypes: [
    'client_credentials' as const,
    'urn:ietf:params:oauth:grant-type:jwt-bearer' as const,
  ],
  accessTokenTtlSeconds: 900,
  audience: 'api-gateway',
  allowedScopes: ['accounts:read'],
};

before(async () => configureOAuthRuntime(AUTH_ENV));

describe('credential authorization rules', () => {
  it('enforces expiry, approved grants, environment and scopes', () => {
    const valid = credential();
    assert.equal(isCredentialValid(valid), true);
    assert.equal(isCredentialValid({ ...valid, status: 'revoked' }), false);
    assert.equal(
      isCredentialValid({ ...valid, expiresAt: new Date(0) }),
      false,
    );
    assert.deepEqual(
      authorizedProducts(valid, 'env-qual-es', 'proxy-test')[0]?.scopes,
      ['accounts:read'],
    );
    valid.productGrants[0].status = 'revoked';
    assert.deepEqual(authorizedProducts(valid, 'env-qual-es', 'proxy-test'), []);
  });
});

describe('OAuth token issuance and verification', () => {
  it('issues a signed environment-bound token for client credentials', async () => {
    const policy = createOAuthTokenPolicyWithDependencies(tokenConfig, {
      findCredential: async () => credential(),
      verifySecret: async secret => secret === 'correct-secret',
      findPublicKey: async () => null,
      consumeAssertion: async () => true,
    });
    const { context } = createPolicyContext({
      headers: {
        authorization: `Basic ${Buffer.from('client-1:correct-secret').toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    context.endpoint.mode = 'local';
    context.req.body = Buffer.from(
      'grant_type=client_credentials&scope=accounts%3Aread',
    );

    const result = await policy(context);
    assert.equal(result.action, 'respond');
    if (result.action !== 'respond') return;
    assert.equal(result.statusCode, 200);
    const token = (result.body as { access_token: string }).access_token;
    const publicKey = gatewayPair.publicKey;
    const verified = await jwtVerify(token, publicKey, {
      issuer: AUTH_ENV.OAUTH_ISSUER,
      audience: 'api-gateway',
      algorithms: ['RS256'],
    });
    assert.equal(verified.payload.environment_id, 'env-qual-es');
    assert.deepEqual(verified.payload.proxy_ids, ['proxy-test']);
  });

  it('validates JWT Bearer assertions and rejects replay fail-closed', async () => {
    const clientPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const clientPrivate = await importPKCS8(
      clientPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'RS256',
    );
    const publicJwk = await exportJWK(clientPair.publicKey);
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'client-key-1' })
      .setIssuer('client-1')
      .setSubject('client-1')
      .setAudience(AUTH_ENV.OAUTH_TOKEN_ENDPOINT_AUDIENCE!)
      .setIssuedAt()
      .setExpirationTime('120s')
      .setJti('assertion-1')
      .sign(clientPrivate);
    let consumed = false;
    const policy = createOAuthTokenPolicyWithDependencies(tokenConfig, {
      findCredential: async () => credential(),
      verifySecret: async () => false,
      findPublicKey: async () => ({
        status: 'approved',
        algorithm: 'RS256',
        jwk: publicJwk,
        validFrom: new Date(0),
        expiresAt: null,
      }),
      consumeAssertion: async () => {
        if (consumed) return false;
        consumed = true;
        return true;
      },
    });
    const request = () => {
      const { context } = createPolicyContext({
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      context.endpoint.mode = 'local';
      context.req.body = Buffer.from(
        `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
      );
      return policy(context);
    };

    assert.equal((await request()).action, 'respond');
    const replay = await request();
    assert.equal(replay.action, 'respond');
    assert.equal(replay.action === 'respond' && replay.statusCode, 400);
    assert.equal(
      replay.action === 'respond' && (replay.body as { error: string }).error,
      'invalid_grant',
    );
  });

  it('returns OAuth server_error when credential storage is unavailable', async () => {
    const policy = createOAuthTokenPolicyWithDependencies(tokenConfig, {
      findCredential: async () => { throw new Error('database unavailable'); },
      verifySecret: async () => false,
      findPublicKey: async () => null,
      consumeAssertion: async () => true,
    });
    const { context } = createPolicyContext({
      headers: {
        authorization: `Basic ${Buffer.from('client-1:any-secret').toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    context.endpoint.mode = 'local';
    context.req.body = Buffer.from('grant_type=client_credentials');

    const result = await policy(context);
    assert.equal(result.action === 'respond' && result.statusCode, 503);
    assert.equal(
      result.action === 'respond' && (result.body as { error: string }).error,
      'server_error',
    );
  });

  it('checks signature, audience, environment, proxy and scopes without PostgreSQL', async () => {
    const privateKey = await importPKCS8(gatewayPrivatePem, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      client_id: 'client-1',
      credential_id: 'credential-1',
      environment_id: 'env-qual-es',
      product_ids: ['product-1'],
      proxy_ids: ['proxy-test'],
      scope: 'accounts:read',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'gateway-test-1' })
      .setIssuer(AUTH_ENV.OAUTH_ISSUER!)
      .setSubject('app-1')
      .setAudience('api-gateway')
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 900)
      .setJti('access-1')
      .sign(privateKey);
    const policy = createOAuthAccessTokenPolicy({
      failureMode: 'closed',
      audience: 'api-gateway',
      requiredScopes: ['accounts:read'],
    });
    const { context } = createPolicyContext({
      headers: { authorization: `Bearer ${token}` },
    });
    assert.deepEqual(await policy(context), { action: 'continue' });

    context.proxy.id = 'another-proxy';
    const wrongProxy = await policy(context);
    assert.equal(wrongProxy.action === 'halt' && wrongProxy.statusCode, 403);
  });

  it('rejects access tokens with invalid issuer, audience, or expiration', async () => {
    const privateKey = await importPKCS8(gatewayPrivatePem, 'RS256');
    const policy = createOAuthAccessTokenPolicy({
      failureMode: 'closed',
      audience: 'api-gateway',
      requiredScopes: [],
    });
    const sign = (issuer: string, audience: string, expiration: number) =>
      new SignJWT({
        client_id: 'client-1',
        credential_id: 'credential-1',
        environment_id: 'env-qual-es',
        product_ids: ['product-1'],
        proxy_ids: ['proxy-test'],
        scope: '',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'gateway-test-1' })
        .setIssuer(issuer)
        .setSubject('app-1')
        .setAudience(audience)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
        .setNotBefore(Math.floor(Date.now() / 1000) - 120)
        .setExpirationTime(expiration)
        .setJti(`access-${issuer}-${audience}-${expiration}`)
        .sign(privateKey);
    for (const token of [
      await sign('https://wrong-issuer.test', 'api-gateway', Math.floor(Date.now() / 1000) + 60),
      await sign(AUTH_ENV.OAUTH_ISSUER!, 'wrong-audience', Math.floor(Date.now() / 1000) + 60),
      await sign(AUTH_ENV.OAUTH_ISSUER!, 'api-gateway', Math.floor(Date.now() / 1000) - 1),
    ]) {
      const { context } = createPolicyContext({
        headers: { authorization: `Bearer ${token}` },
      });
      const result = await policy(context);
      assert.equal(result.action === 'halt' && result.statusCode, 401);
    }
  });
});

describe('mTLS direct authentication', () => {
  it('rejects spoofed ingress headers and authorizes an approved fingerprint', async () => {
    const dependencies = {
      isTrustedProxy: (address: string) => address === '10.1.2.3',
      findCertificate: async () => ({
        status: 'approved',
        validFrom: new Date(0),
        expiresAt: null,
        credential: credential('mtls'),
      }),
    };
    const policy = createMtlsPolicyWithDependencies(
      { failureMode: 'closed' },
      dependencies,
    );
    const { context } = createPolicyContext({
      headers: {
        'x-gateway-client-cert-sha256': 'ab'.repeat(32),
      },
    });
    context.req.raw = { socket: { remoteAddress: '203.0.113.1' } } as never;
    assert.equal((await policy(context)).action, 'halt');

    context.req.raw = { socket: { remoteAddress: '10.1.2.3' } } as never;
    assert.deepEqual(await policy(context), { action: 'continue' });
    assert.equal(context.client?.credentialId, 'credential-1');

    context.req.headers['x-gateway-client-cert-sha256'] = 'malformed';
    const malformed = await createMtlsPolicyWithDependencies(
      { failureMode: 'open' },
      dependencies,
    )(context);
    assert.equal(malformed.action === 'halt' && malformed.statusCode, 401);
  });

  it('rejects expired certificates and revoked credentials', async () => {
    const { context } = createPolicyContext({
      headers: {
        'x-gateway-client-cert-sha256': 'cd'.repeat(32),
      },
    });
    context.req.raw = { socket: { remoteAddress: '10.1.2.3' } } as never;
    const expired = createMtlsPolicyWithDependencies(
      { failureMode: 'closed' },
      {
        isTrustedProxy: () => true,
        findCertificate: async () => ({
          status: 'approved',
          validFrom: new Date(0),
          expiresAt: new Date(0),
          credential: credential('mtls'),
        }),
      },
    );
    assert.equal((await expired(context)).action, 'halt');

    const revoked = credential('mtls');
    revoked.status = 'revoked';
    const revokedPolicy = createMtlsPolicyWithDependencies(
      { failureMode: 'closed' },
      {
        isTrustedProxy: () => true,
        findCertificate: async () => ({
          status: 'approved',
          validFrom: new Date(0),
          expiresAt: null,
          credential: revoked,
        }),
      },
    );
    assert.equal((await revokedPolicy(context)).action, 'halt');
  });

  it('maps different connection fingerprints to different applications', async () => {
    const firstFingerprint = '11'.repeat(32);
    const secondFingerprint = '22'.repeat(32);
    const first = credential('mtls');
    const second = credential('mtls');
    second.id = 'credential-2';
    second.consumerKey = 'consumer-key-2';
    second.appId = 'app-2';
    second.app.id = 'app-2';
    const policy = createMtlsPolicyWithDependencies(
      { failureMode: 'closed' },
      {
        isTrustedProxy: () => true,
        findCertificate: async fingerprint => ({
          status: 'approved',
          validFrom: new Date(0),
          expiresAt: null,
          credential: fingerprint === firstFingerprint ? first : second,
        }),
      },
    );

    const firstRequest = createPolicyContext({
      headers: { 'x-gateway-client-cert-sha256': firstFingerprint },
    }).context;
    firstRequest.req.raw = { socket: { remoteAddress: '10.1.2.3' } } as never;
    const secondRequest = createPolicyContext({
      headers: { 'x-gateway-client-cert-sha256': secondFingerprint },
    }).context;
    secondRequest.req.raw = { socket: { remoteAddress: '10.1.2.3' } } as never;

    assert.deepEqual(await policy(firstRequest), { action: 'continue' });
    assert.deepEqual(await policy(secondRequest), { action: 'continue' });
    assert.equal(firstRequest.client?.appId, 'app-1');
    assert.equal(secondRequest.client?.appId, 'app-2');
  });
});

describe('local endpoints', () => {
  it('returns JWKS without attempting forwarding', async () => {
    const server = await buildServer({
      config: AUTH_ENV,
      logger: false,
      proxies: [{
        id: 'oauth',
        name: 'OAuth',
        basePath: '/oauth',
        deploymentId: 'oauth-qual-es',
        environment: {
          id: 'env-qual-es',
          stage: 'qual',
          region: 'es',
          publicOrigin: 'https://qual-es.gateway.localhost:8443',
        },
        systemManaged: true,
        upstreamBaseUrl: null,
        organizationId: 'org-platform',
        active: true,
        endpoints: [{
          id: 'jwks',
          mode: 'local',
          path: '/.well-known/jwks.json',
          targetPath: null,
          policies: [{
            type: 'jwks-endpoint',
            order: 1,
            enabled: true,
            config: { failureMode: 'closed' },
          }],
        }],
      }],
    });
    const response = await server.inject({
      method: 'GET',
      url: '/oauth/.well-known/jwks.json',
      headers: { host: 'qual-es.gateway.localhost:8443' },
    });
    await server.close();

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().keys[0].kid, 'gateway-test-1');
    assert.equal(response.json().keys[0].d, undefined);
  });

  it('rejects a local endpoint without a terminal response policy at startup', async () => {
    await assert.rejects(() => buildServer({
      config: TEST_ENV,
      logger: false,
      proxies: [{
        id: 'invalid-local',
        name: 'Invalid local',
        basePath: '/invalid',
        deploymentId: 'invalid-local-qual-es',
        environment: {
          id: 'env-qual-es',
          stage: 'qual',
          region: 'es',
          publicOrigin: 'https://qual-es.gateway.localhost:8443',
        },
        systemManaged: false,
        upstreamBaseUrl: null,
        organizationId: 'org-test',
        active: true,
        endpoints: [{
          id: 'invalid',
          mode: 'local',
          path: '/resource',
          targetPath: null,
          policies: [],
        }],
      }],
    }), /no terminal response policy/);
  });
});
