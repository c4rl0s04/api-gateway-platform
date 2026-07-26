import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  EncryptedFileKeyStore,
  loadOrCreateMasterKey,
} from '../src/keystore.js';

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
development-test-key-material
-----END PRIVATE KEY-----`;

describe('encrypted file keystore', () => {
  it('creates a reusable protected master key', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pki-master-'));
    try {
      const keyPath = path.join(directory, 'master.key');
      const first = await loadOrCreateMasterKey(keyPath);
      const second = await loadOrCreateMasterKey(keyPath);
      assert.equal(first.length, 32);
      assert.deepEqual(first, second);
      assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('encrypts private keys and decrypts them only with the master key', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'pki-store-'));
    try {
      const masterKey = Buffer.alloc(32, 7);
      const store = new EncryptedFileKeyStore(directory, masterKey);
      await store.put('authorities/ca-one', PRIVATE_KEY);

      const encrypted = await readFile(
        path.join(directory, 'authorities/ca-one.json'),
        'utf8',
      );
      assert.equal(encrypted.includes('development-test-key-material'), false);
      assert.equal(await store.get('authorities/ca-one'), PRIVATE_KEY);
      assert.equal(await store.exists('authorities/ca-one'), true);

      const wrongStore = new EncryptedFileKeyStore(directory, Buffer.alloc(32, 8));
      await assert.rejects(() => wrongStore.get('authorities/ca-one'));

      await store.delete('authorities/ca-one');
      assert.equal(await store.exists('authorities/ca-one'), false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects unsafe key references', async () => {
    const store = new EncryptedFileKeyStore('/tmp/pki-unused', Buffer.alloc(32));
    await assert.rejects(() => store.put('../outside', PRIVATE_KEY));
  });
});
