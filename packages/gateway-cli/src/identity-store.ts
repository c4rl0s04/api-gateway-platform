import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  X509Certificate,
} from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClientCertificateRequest } from '@api-gateway/pki';
import { exportJWK } from 'jose';
import type { MasterKeyProvider } from './keychain.js';
import {
  GatewayCtlError,
  type IdentityType,
  type LocalIdentity,
  type PublicIdentity,
} from './types.js';

interface IdentityManifest {
  version: 1;
  identities: LocalIdentity[];
}

interface EncryptedPayload {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

const IDENTITY_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export class IdentityStore {
  readonly rootDirectory: string;
  private readonly manifestFile: string;

  constructor(
    private readonly masterKeys: MasterKeyProvider,
    rootDirectory = path.join(os.homedir(), '.gatewayctl'),
  ) {
    this.rootDirectory = rootDirectory;
    this.manifestFile = path.join(rootDirectory, 'identities.json');
  }

  async list(): Promise<PublicIdentity[]> {
    const manifest = await this.readManifest();
    return Promise.all(manifest.identities.map(async identity => {
      if (!identity.certificateFile) return toPublicIdentity(identity);
      try {
        const certificate = new X509Certificate(
          await readFile(identity.certificateFile, 'utf8'),
        );
        return toPublicIdentity(identity, certificate);
      } catch {
        return toPublicIdentity(identity);
      }
    }));
  }

  async get(identityId: string): Promise<LocalIdentity> {
    const identity = (await this.readManifest()).identities.find(
      candidate => candidate.id === identityId,
    );
    if (!identity) {
      throw new GatewayCtlError('identity_not_found', 'Local identity does not exist');
    }
    return identity;
  }

  async generateJwt(input: {
    name: string;
    consumerKey?: string;
  }): Promise<PublicIdentity> {
    validateName(input.name);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2_048,
    });
    const privateKeyPem = privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }).toString();
    const publicJwk = await exportJWK(publicKey);
    const fingerprint = fingerprintPublicKey(publicKey);
    const identity = await this.persistGeneratedIdentity({
      name: input.name,
      type: 'jwt',
      algorithm: 'RS256',
      privateKeyPem,
      publicJwk,
      fingerprint,
      consumerKey: normalizeOptionalConsumerKey(input.consumerKey),
    });
    return toPublicIdentity(identity);
  }

  async generateMtls(input: {
    name: string;
    credentialId: string;
    algorithm?: 'rsa' | 'ec';
  }): Promise<{ identity: PublicIdentity; csr: string }> {
    validateName(input.name);
    const generated = await createClientCertificateRequest({
      credentialId: input.credentialId,
      algorithm: input.algorithm,
    });
    const publicKey = createPublicKey(generated.privateKeyPem);
    const identity = await this.persistGeneratedIdentity({
      name: input.name,
      type: 'mtls',
      algorithm: input.algorithm ?? 'rsa',
      privateKeyPem: generated.privateKeyPem,
      fingerprint: fingerprintPublicKey(publicKey),
      csr: generated.csrPem,
    });
    return { identity: toPublicIdentity(identity), csr: generated.csrPem };
  }

  async addFileIdentity(input: {
    name: string;
    type: IdentityType;
    privateKeyFile: string;
    certificateFile?: string;
    chainFile?: string;
    consumerKey?: string;
  }): Promise<PublicIdentity> {
    validateName(input.name);
    const privateKeyFile = path.resolve(input.privateKeyFile);
    await assertPrivateKeyFile(privateKeyFile);
    const privateKeyPem = await readFile(privateKeyFile, 'utf8');
    const publicKey = createPublicKey(privateKeyPem);
    validatePrivateKey(input.type, publicKey);
    const publicJwk = input.type === 'jwt' ? await exportJWK(publicKey) : undefined;
    const identity: LocalIdentity = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      source: 'file',
      algorithm: input.type === 'jwt'
        ? 'RS256'
        : publicKey.asymmetricKeyType === 'ec' ? 'ec' : 'rsa',
      fingerprint: fingerprintPublicKey(publicKey),
      consumerKey: normalizeOptionalConsumerKey(input.consumerKey),
      publicJwk,
      privateKey: { kind: 'file', location: privateKeyFile },
      certificateFile: input.certificateFile
        ? path.resolve(input.certificateFile)
        : undefined,
      chainFile: input.chainFile ? path.resolve(input.chainFile) : undefined,
      createdAt: new Date().toISOString(),
    };
    if (identity.type === 'mtls' && identity.certificateFile) {
      await assertPublicMaterialFile(identity.certificateFile);
      if (identity.chainFile) await assertPublicMaterialFile(identity.chainFile);
      assertCertificateMatchesKey(
        await readFile(identity.certificateFile, 'utf8'),
        privateKeyPem,
      );
    }
    await this.addIdentity(identity);
    return toPublicIdentity(identity);
  }

  async remove(identityId: string): Promise<void> {
    const manifest = await this.readManifest();
    const index = manifest.identities.findIndex(identity => identity.id === identityId);
    if (index === -1) {
      throw new GatewayCtlError('identity_not_found', 'Local identity does not exist');
    }
    const [identity] = manifest.identities.splice(index, 1);
    await this.writeManifest(manifest);
    if (identity.privateKey.kind === 'encrypted') {
      await rm(path.dirname(identity.privateKey.location), {
        recursive: true,
        force: true,
      });
    }
    await rm(path.join(this.rootDirectory, 'certificates', identity.id), {
      recursive: true,
      force: true,
    });
  }

  async readPrivateKey(identity: LocalIdentity): Promise<string> {
    if (identity.privateKey.kind === 'file') {
      await assertPrivateKeyFile(identity.privateKey.location);
      return readFile(identity.privateKey.location, 'utf8');
    }
    const encrypted = JSON.parse(
      await readFile(identity.privateKey.location, 'utf8'),
    ) as EncryptedPayload;
    const masterKey = await this.masterKeys.getOrCreate();
    if (masterKey.byteLength !== 32) {
      throw new GatewayCtlError('keychain_invalid', 'Keychain master key is invalid');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      masterKey,
      Buffer.from(encrypted.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  async installCertificate(input: {
    identityId: string;
    certificatePem: string;
    chainPem?: string;
  }): Promise<PublicIdentity> {
    const manifest = await this.readManifest();
    const identity = manifest.identities.find(item => item.id === input.identityId);
    if (!identity || identity.type !== 'mtls') {
      throw new GatewayCtlError('identity_not_found', 'mTLS identity does not exist');
    }
    assertCertificateMatchesKey(
      input.certificatePem,
      await this.readPrivateKey(identity),
    );
    const directory = path.join(this.rootDirectory, 'certificates', identity.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    identity.certificateFile = path.join(directory, 'client.crt');
    identity.chainFile = input.chainPem ? path.join(directory, 'chain.crt') : undefined;
    await writePrivateAtomic(identity.certificateFile, input.certificatePem, 0o600);
    if (input.chainPem && identity.chainFile) {
      await writePrivateAtomic(identity.chainFile, input.chainPem, 0o600);
    }
    await this.writeManifest(manifest);
    return toPublicIdentity(identity);
  }

  async getCsr(identityId: string): Promise<string> {
    const identity = await this.get(identityId);
    if (identity.type !== 'mtls' || !identity.csrFile) {
      throw new GatewayCtlError('csr_not_found', 'Identity has no certificate request');
    }
    return readFile(identity.csrFile, 'utf8');
  }

  private async persistGeneratedIdentity(input: {
    name: string;
    type: IdentityType;
    algorithm: LocalIdentity['algorithm'];
    privateKeyPem: string;
    publicJwk?: LocalIdentity['publicJwk'];
    fingerprint: string;
    consumerKey?: string;
    csr?: string;
  }): Promise<LocalIdentity> {
    const id = randomUUID();
    const directory = path.join(this.rootDirectory, 'keys', id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const privateKeyFile = path.join(directory, 'private-key.enc.json');
    await this.writeEncryptedKey(privateKeyFile, input.privateKeyPem);
    const csrFile = input.csr ? path.join(directory, 'client.csr') : undefined;
    if (csrFile && input.csr) await writePrivateAtomic(csrFile, input.csr, 0o600);
    const identity: LocalIdentity = {
      id,
      name: input.name,
      type: input.type,
      source: 'generated',
      algorithm: input.algorithm,
      fingerprint: input.fingerprint,
      consumerKey: input.consumerKey,
      publicJwk: input.publicJwk,
      privateKey: { kind: 'encrypted', location: privateKeyFile },
      csrFile,
      createdAt: new Date().toISOString(),
    };
    await this.addIdentity(identity);
    return identity;
  }

  private async writeEncryptedKey(file: string, privateKeyPem: string): Promise<void> {
    const masterKey = await this.masterKeys.getOrCreate();
    if (masterKey.byteLength !== 32) {
      throw new GatewayCtlError('keychain_invalid', 'Keychain master key is invalid');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(privateKeyPem, 'utf8'),
      cipher.final(),
    ]);
    const payload: EncryptedPayload = {
      version: 1,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
    await writePrivateAtomic(file, `${JSON.stringify(payload)}\n`, 0o600);
  }

  private async addIdentity(identity: LocalIdentity): Promise<void> {
    const manifest = await this.readManifest();
    if (manifest.identities.some(item => item.name === identity.name)) {
      throw new GatewayCtlError('identity_name_conflict', 'Identity name already exists');
    }
    manifest.identities.push(identity);
    await this.writeManifest(manifest);
  }

  private async readManifest(): Promise<IdentityManifest> {
    await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
    try {
      return JSON.parse(await readFile(this.manifestFile, 'utf8')) as IdentityManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { version: 1, identities: [] };
    }
  }

  private async writeManifest(manifest: IdentityManifest): Promise<void> {
    await writePrivateAtomic(
      this.manifestFile,
      `${JSON.stringify(manifest, null, 2)}\n`,
      0o600,
    );
  }
}

function toPublicIdentity(
  identity: LocalIdentity,
  certificate?: X509Certificate,
): PublicIdentity {
  return {
    id: identity.id,
    name: identity.name,
    type: identity.type,
    source: identity.source,
    algorithm: identity.algorithm,
    fingerprint: identity.fingerprint,
    consumerKey: identity.consumerKey,
    publicJwk: identity.publicJwk,
    hasCertificate: Boolean(identity.certificateFile),
    certificateFingerprintSha256: certificate?.fingerprint256
      .replaceAll(':', '')
      .toLowerCase(),
    certificateExpiresAt: certificate
      ? new Date(certificate.validTo).toISOString()
      : undefined,
    createdAt: identity.createdAt,
  };
}

function fingerprintPublicKey(key: ReturnType<typeof createPublicKey>): string {
  return createHash('sha256').update(key.export({
    format: 'der',
    type: 'spki',
  })).digest('hex');
}

function validatePrivateKey(
  type: IdentityType,
  key: ReturnType<typeof createPublicKey>,
): void {
  if (type === 'jwt') {
    if (key.asymmetricKeyType !== 'rsa'
      || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2_048) {
      throw new GatewayCtlError(
        'invalid_jwt_key',
        'JWT identities require an RSA key of at least 2048 bits',
      );
    }
    return;
  }
  const validRsa = key.asymmetricKeyType === 'rsa'
    && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2_048;
  const validEc = key.asymmetricKeyType === 'ec'
    && ['prime256v1', 'secp384r1'].includes(
      key.asymmetricKeyDetails?.namedCurve ?? '',
    );
  if (!validRsa && !validEc) {
    throw new GatewayCtlError(
      'invalid_mtls_key',
      'mTLS identities require RSA 2048+ or EC P-256/P-384',
    );
  }
}

function assertCertificateMatchesKey(
  certificatePem: string,
  privateKeyPem: string,
): void {
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(certificatePem);
  } catch {
    throw new GatewayCtlError('invalid_certificate', 'Client certificate is invalid');
  }
  const certificateFingerprint = fingerprintPublicKey(certificate.publicKey);
  const privateKeyFingerprint = fingerprintPublicKey(createPublicKey(privateKeyPem));
  if (certificateFingerprint !== privateKeyFingerprint) {
    throw new GatewayCtlError(
      'certificate_key_mismatch',
      'Client certificate does not match the local private key',
    );
  }
}

function validateName(name: string): void {
  if (!IDENTITY_NAME.test(name)) {
    throw new GatewayCtlError(
      'invalid_identity_name',
      'Identity names may contain letters, numbers, dots, underscores, and hyphens',
    );
  }
}

function normalizeOptionalConsumerKey(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || /[\s:\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new GatewayCtlError('invalid_consumer_key', 'Consumer key is invalid');
  }
  return normalized;
}

async function assertPrivateKeyFile(file: string): Promise<void> {
  const details = await stat(file);
  if (!details.isFile()) {
    throw new GatewayCtlError('invalid_key_file', 'Private key path is not a file');
  }
  if (typeof process.getuid === 'function' && details.uid !== process.getuid()) {
    throw new GatewayCtlError('unsafe_key_file', 'Private key must be owned by the current user');
  }
  if ((details.mode & 0o077) !== 0) {
    throw new GatewayCtlError(
      'unsafe_key_file',
      'Private key permissions must not allow group or other access',
    );
  }
}

async function assertPublicMaterialFile(file: string): Promise<void> {
  const details = await stat(file);
  if (!details.isFile()) {
    throw new GatewayCtlError('invalid_certificate_file', 'Certificate path is not a file');
  }
}

async function writePrivateAtomic(
  file: string,
  contents: string,
  mode: number,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode });
  await rename(temporary, file);
  await chmod(file, mode);
}
