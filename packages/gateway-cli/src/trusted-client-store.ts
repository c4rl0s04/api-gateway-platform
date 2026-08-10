import { createPublicKey } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { JWK } from 'jose';
import { GatewayCtlError } from './types.js';

export interface TrustedBrowserClient {
  id: string;
  origin: string;
  label: string;
  publicJwk: JWK;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

export interface PublicTrustedBrowserClient extends Omit<TrustedBrowserClient, 'publicJwk'> {
  status: 'active' | 'expired' | 'revoked';
  publicJwk: Pick<JWK, 'kty' | 'crv' | 'x' | 'y'>;
}

interface TrustedClientManifest {
  version: 1;
  clients: TrustedBrowserClient[];
}

export class TrustedClientStore {
  private mutation = Promise.resolve();

  constructor(
    private readonly rootDirectory: string,
    private readonly trustDays: number,
  ) {}

  async list(now = new Date()): Promise<PublicTrustedBrowserClient[]> {
    const manifest = await this.read();
    return manifest.clients.map(client => ({
      ...client,
      publicJwk: publicCoordinates(client.publicJwk),
      status: client.revokedAt
        ? 'revoked'
        : new Date(client.expiresAt).getTime() <= now.getTime()
          ? 'expired'
          : 'active',
    }));
  }

  async findActive(id: string, origin: string, now = new Date()): Promise<TrustedBrowserClient | null> {
    const manifest = await this.read();
    const client = manifest.clients.find(candidate => candidate.id === id && candidate.origin === origin);
    if (!client || client.revokedAt || new Date(client.expiresAt).getTime() <= now.getTime()) return null;
    return client;
  }

  async register(input: {
    id: string;
    origin: string;
    label: string;
    publicJwk: JWK;
    now?: Date;
  }): Promise<PublicTrustedBrowserClient> {
    validateClientId(input.id);
    validateOrigin(input.origin);
    validateLabel(input.label);
    validateBrowserPublicJwk(input.publicJwk);
    const now = input.now ?? new Date();
    const client: TrustedBrowserClient = {
      id: input.id,
      origin: input.origin,
      label: input.label.trim(),
      publicJwk: publicCoordinates(input.publicJwk),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.trustDays * 86_400_000).toISOString(),
      lastSeenAt: now.toISOString(),
    };
    await this.mutate(manifest => {
      const existing = manifest.clients.find(candidate =>
        candidate.id === input.id && candidate.origin === input.origin);
      if (existing && !existing.revokedAt
        && new Date(existing.expiresAt).getTime() > now.getTime()) {
        throw new GatewayCtlError('client_already_registered', 'Browser client is already registered');
      }
      manifest.clients = manifest.clients.filter(candidate =>
        candidate.id !== input.id || candidate.origin !== input.origin);
      manifest.clients.push(client);
    });
    return { ...client, publicJwk: publicCoordinates(client.publicJwk), status: 'active' };
  }

  async touch(id: string, origin: string, now = new Date()): Promise<void> {
    await this.mutate(manifest => {
      const client = manifest.clients.find(candidate => candidate.id === id && candidate.origin === origin);
      if (!client || client.revokedAt) return;
      if (now.getTime() - new Date(client.lastSeenAt).getTime() >= 3_600_000) {
        client.lastSeenAt = now.toISOString();
      }
    });
  }

  async revoke(id: string, now = new Date()): Promise<PublicTrustedBrowserClient> {
    let revoked: TrustedBrowserClient | undefined;
    await this.mutate(manifest => {
      revoked = manifest.clients.find(candidate => candidate.id === id);
      if (!revoked) throw new GatewayCtlError('client_not_found', 'Trusted browser client was not found');
      revoked.revokedAt ??= now.toISOString();
    });
    return {
      ...revoked!,
      publicJwk: publicCoordinates(revoked!.publicJwk),
      status: 'revoked',
    };
  }

  private async mutate(change: (manifest: TrustedClientManifest) => void): Promise<void> {
    const operation = this.mutation.then(async () => {
      const manifest = await this.read();
      change(manifest);
      await this.write(manifest);
    });
    this.mutation = operation.catch(() => undefined);
    return operation;
  }

  private async read(): Promise<TrustedClientManifest> {
    try {
      const parsed = JSON.parse(
        await readFile(path.join(this.rootDirectory, 'trusted-clients.json'), 'utf8'),
      ) as TrustedClientManifest;
      if (parsed.version !== 1 || !Array.isArray(parsed.clients)) {
        throw new Error('unsupported manifest');
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, clients: [] };
      throw new GatewayCtlError('trusted_clients_invalid', 'Trusted browser client registry is invalid');
    }
  }

  private async write(manifest: TrustedClientManifest): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
    const target = path.join(this.rootDirectory, 'trusted-clients.json');
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await rename(temporary, target);
  }
}

function validateBrowserPublicJwk(jwk: JWK): void {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || 'd' in jwk) {
    throw new GatewayCtlError('invalid_client_key', 'Browser client key must be a public P-256 JWK');
  }
  try {
    const key = createPublicKey({ key: publicCoordinates(jwk), format: 'jwk' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw new Error('unexpected curve');
    }
  } catch {
    throw new GatewayCtlError('invalid_client_key', 'Browser client public JWK is invalid');
  }
}

function publicCoordinates(jwk: JWK): Pick<JWK, 'kty' | 'crv' | 'x' | 'y'> {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

function validateClientId(value: string): void {
  if (!/^[a-zA-Z0-9_-]{16,120}$/u.test(value)) {
    throw new GatewayCtlError('invalid_client_id', 'Browser client ID is invalid');
  }
}

function validateOrigin(value: string): void {
  try {
    const origin = new URL(value);
    if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol)) throw new Error();
  } catch {
    throw new GatewayCtlError('invalid_origin', 'Browser client origin is invalid');
  }
}

function validateLabel(value: string): void {
  if (!value.trim() || value.trim().length > 100 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new GatewayCtlError('invalid_client_label', 'Browser client label is invalid');
  }
}
