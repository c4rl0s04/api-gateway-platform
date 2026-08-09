import { randomBytes } from 'node:crypto';
import { AsyncEntry } from '@napi-rs/keyring';

export interface MasterKeyProvider {
  getOrCreate(): Promise<Buffer>;
}

export interface KeychainEntry {
  getSecret(): Promise<Uint8Array | undefined | null>;
  setSecret(secret: Uint8Array): Promise<void>;
}

export class SystemKeychainMasterKeyProvider implements MasterKeyProvider {
  private readonly entry: KeychainEntry;

  constructor(
    service = 'api-gateway-platform.gatewayctl',
    account = 'local-keystore-master-key',
    entry: KeychainEntry = new AsyncEntry(service, account),
  ) {
    this.entry = entry;
  }

  async getOrCreate(): Promise<Buffer> {
    const existing = await this.entry.getSecret();
    if (existing != null) return Buffer.from(existing);
    const created = randomBytes(32);
    await this.entry.setSecret(created);
    return created;
  }
}
