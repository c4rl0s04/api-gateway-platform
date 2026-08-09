import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { importJWK, jwtVerify } from 'jose';
import {
  AgentOperations,
  GatewayCtlError,
  IdentityStore,
  type MasterKeyProvider,
} from '../src/index.js';

class TestMasterKeyProvider implements MasterKeyProvider {
  async getOrCreate(): Promise<Buffer> {
    return Buffer.alloc(32, 11);
  }
}

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('gatewayctl closed operations', () => {
  it('signs bounded RS256 client assertions with local keys', async () => {
    const { store, operations } = await fixture();
    const identity = await store.generateJwt({
      name: 'assertion-key',
      consumerKey: 'ck_test',
    });
    const result = await operations.execute('jwt.signAssertion', {
      identityId: identity.id,
      consumerKey: 'ck_test',
      kid: 'test-kid',
      audience: 'https://qual-es.gateway.localhost:8443/oauth/token',
      ttlSeconds: 60,
    }) as { assertion: string };

    const publicKey = await importJWK(identity.publicJwk!, 'RS256');
    const verified = await jwtVerify(result.assertion, publicKey, {
      algorithms: ['RS256'],
      audience: 'https://qual-es.gateway.localhost:8443/oauth/token',
      issuer: 'ck_test',
      subject: 'ck_test',
    });
    assert.equal(verified.protectedHeader.kid, 'test-kid');
    assert.ok((verified.payload.exp ?? 0) - (verified.payload.iat ?? 0) <= 60);
  });

  it('rejects unknown operations, mismatched keys, hosts, and excessive TTLs', async () => {
    const { store, operations } = await fixture();
    const identity = await store.generateJwt({
      name: 'bounded-key',
      consumerKey: 'ck_expected',
    });
    await assert.rejects(
      operations.execute('readFile', { path: '/etc/passwd' }),
      (error: unknown) => error instanceof GatewayCtlError
        && error.code === 'operation_not_allowed',
    );
    await assert.rejects(
      operations.execute('jwt.signAssertion', {
        identityId: identity.id,
        consumerKey: 'ck_other',
        kid: 'kid',
        audience: 'https://qual-es.gateway.localhost/oauth/token',
      }),
      /different consumer key/u,
    );
    await assert.rejects(
      operations.execute('jwt.signAssertion', {
        identityId: identity.id,
        consumerKey: 'ck_expected',
        kid: 'kid',
        audience: 'https://attacker.example/oauth/token',
      }),
      /not allowed/u,
    );
    await assert.rejects(
      operations.execute('jwt.signAssertion', {
        identityId: identity.id,
        consumerKey: 'ck_expected',
        kid: 'kid',
        audience: 'https://qual-es.gateway.localhost/oauth/token',
        ttlSeconds: 121,
      }),
      /between 1 and 120/u,
    );
  });

  it('removes identities only through the closed identity operation', async () => {
    const { store, operations } = await fixture();
    const identity = await store.generateJwt({ name: 'temporary-key' });

    assert.deepEqual(
      await operations.execute('identity.remove', { identityId: identity.id }),
      { removed: true },
    );
    assert.deepEqual(await store.list(), []);
  });
});

async function fixture(): Promise<{
  store: IdentityStore;
  operations: AgentOperations;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-test-'));
  directories.push(directory);
  const store = new IdentityStore(new TestMasterKeyProvider(), directory);
  return {
    store,
    operations: new AgentOperations(store, {
      allowedOrigins: ['http://localhost:8080'],
      allowedAudienceHosts: ['*.gateway.localhost'],
      playgroundUrl: 'http://localhost:8080/playground',
    }),
  };
}
