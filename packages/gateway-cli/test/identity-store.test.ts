import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { IdentityStore, type MasterKeyProvider } from '../src/index.js';

class TestMasterKeyProvider implements MasterKeyProvider {
  readonly key = Buffer.alloc(32, 7);

  async getOrCreate(): Promise<Buffer> {
    return this.key;
  }
}

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe('gatewayctl identity store', () => {
  it('encrypts generated JWT keys and exposes only public metadata', async () => {
    const directory = await temporaryDirectory();
    const store = new IdentityStore(new TestMasterKeyProvider(), directory);
    const identity = await store.generateJwt({
      name: 'banking-jwt',
      consumerKey: 'consumer-key',
    });

    assert.equal(identity.type, 'jwt');
    assert.equal(identity.algorithm, 'RS256');
    assert.ok(identity.publicJwk?.n);
    assert.equal('privateKey' in identity, false);

    const manifest = await readFile(path.join(directory, 'identities.json'), 'utf8');
    assert.equal(manifest.includes('PRIVATE KEY'), false);
    const stored = await store.get(identity.id);
    const encrypted = await readFile(stored.privateKey.location, 'utf8');
    assert.equal(encrypted.includes('PRIVATE KEY'), false);
    assert.match(await store.readPrivateKey(stored), /BEGIN PRIVATE KEY/u);
  });

  it('generates an mTLS CSR while retaining its private key locally', async () => {
    const store = new IdentityStore(
      new TestMasterKeyProvider(),
      await temporaryDirectory(),
    );
    const generated = await store.generateMtls({
      name: 'banking-mtls',
      credentialId: 'credential-test',
    });

    assert.equal(generated.identity.type, 'mtls');
    assert.match(generated.csr, /BEGIN CERTIFICATE REQUEST/u);
    assert.equal(await store.getCsr(generated.identity.id), generated.csr);
  });

  it('rejects imported private keys with group-readable permissions', async () => {
    const directory = await temporaryDirectory();
    const keyFile = path.join(directory, 'unsafe.pem');
    await writeFile(keyFile, 'not-a-key', { mode: 0o644 });
    const store = new IdentityStore(new TestMasterKeyProvider(), directory);

    await assert.rejects(
      store.addFileIdentity({
        name: 'unsafe-key',
        type: 'jwt',
        privateKeyFile: keyFile,
      }),
      /permissions/u,
    );
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gatewayctl-test-'));
  directories.push(directory);
  return directory;
}
