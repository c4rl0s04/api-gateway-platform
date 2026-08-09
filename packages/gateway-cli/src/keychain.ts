import { randomBytes } from 'node:crypto';
import { AsyncEntry } from '@napi-rs/keyring';

export interface MasterKeyProvider {
  getOrCreate(): Promise<Buffer>;
}

export class SystemKeychainMasterKeyProvider implements MasterKeyProvider {
  private readonly entry: AsyncEntry;

  constructor(
    service = 'api-gateway-platform.gatewayctl',
    account = 'local-keystore-master-key',
  ) {
    this.entry = new AsyncEntry(service, account);
  }

  async getOrCreate(): Promise<Buffer> {
    const existing = await this.entry.getSecret();
    if (existing !== undefined) return Buffer.from(existing);
    const created = randomBytes(32);
    await this.entry.setSecret(created);
    return created;
  }
}
