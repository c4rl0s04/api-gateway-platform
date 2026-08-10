import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { exportJWK } from 'jose';
import { GatewayCtlError, TrustedClientStore } from '../src/index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('gatewayctl trusted browser clients', () => {
  it('persists only public browser keys and derives expiry status', async () => {
    const { store, directory, publicJwk } = await fixture(30);
    const now = new Date('2030-01-01T00:00:00.000Z');
    const registered = await store.register({
      id: 'browser-client-0001',
      origin: 'https://gateway.example.com',
      label: 'Chrome on macOS',
      publicJwk,
      now,
    });
    assert.equal(registered.status, 'active');
    assert.equal('d' in registered.publicJwk, false);
    assert.equal((await stat(path.join(directory, 'trusted-clients.json'))).mode & 0o777, 0o600);
    assert.ok(await store.findActive(registered.id, registered.origin, now));
    assert.equal(await store.findActive(
      registered.id,
      registered.origin,
      new Date('2030-02-01T00:00:00.000Z'),
    ), null);
  });

  it('revokes clients without deleting their audit metadata', async () => {
    const { store, publicJwk } = await fixture(30);
    await store.register({
      id: 'browser-client-0002',
      origin: 'http://localhost:8080',
      label: 'Local browser',
      publicJwk,
    });
    const revoked = await store.revoke('browser-client-0002');
    assert.equal(revoked.status, 'revoked');
    assert.equal(await store.findActive('browser-client-0002', 'http://localhost:8080'), null);
    assert.equal((await store.list())[0]?.status, 'revoked');
  });

  it('rejects private, malformed, and duplicate active browser keys', async () => {
    const { store, publicJwk, privateJwk } = await fixture(30);
    await assert.rejects(
      store.register({ id: 'browser-client-0003', origin: 'http://localhost:8080', label: 'Bad', publicJwk: privateJwk }),
      (error: unknown) => error instanceof GatewayCtlError && error.code === 'invalid_client_key',
    );
    await store.register({ id: 'browser-client-0003', origin: 'http://localhost:8080', label: 'Good', publicJwk });
    await assert.rejects(
      store.register({ id: 'browser-client-0003', origin: 'http://localhost:8080', label: 'Again', publicJwk }),
      (error: unknown) => error instanceof GatewayCtlError && error.code === 'client_already_registered',
    );
  });
});

async function fixture(trustDays: number) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-clients-'));
  directories.push(directory);
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    directory,
    store: new TrustedClientStore(directory, trustDays),
    publicJwk: await exportJWK(publicKey),
    privateJwk: await exportJWK(privateKey),
  };
}
