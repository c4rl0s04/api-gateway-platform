import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SystemKeychainMasterKeyProvider, type KeychainEntry } from '../src/index.js';

class EmptyKeychainEntry implements KeychainEntry {
  secret: Uint8Array | null = null;

  async getSecret(): Promise<Uint8Array | null> {
    return this.secret;
  }

  async setSecret(secret: Uint8Array): Promise<void> {
    this.secret = new Uint8Array(secret);
  }
}

describe('SystemKeychainMasterKeyProvider', () => {
  it('creates and reuses a master key when the keychain returns null', async () => {
    const entry = new EmptyKeychainEntry();
    const provider = new SystemKeychainMasterKeyProvider('test', 'test', entry);

    const created = await provider.getOrCreate();
    const reused = await provider.getOrCreate();

    assert.equal(created.byteLength, 32);
    assert.deepEqual(reused, created);
  });
});
