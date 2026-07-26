import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,254}$/;

interface EncryptedKeyFile {
  version: 1;
  algorithm: typeof ALGORITHM;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface KeyStore {
  put(keyRef: string, privateKeyPem: string): Promise<void>;
  get(keyRef: string): Promise<string>;
  delete(keyRef: string): Promise<void>;
  exists(keyRef: string): Promise<boolean>;
}

function validateKeyRef(keyRef: string): void {
  if (
    !KEY_REF_PATTERN.test(keyRef)
    || keyRef.includes('//')
    || keyRef.split('/').includes('..')
  ) {
    throw new Error('keyRef must be a safe relative identifier');
  }
}

function validateMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== KEY_BYTES) {
    throw new Error('PKI master key must contain exactly 32 bytes');
  }
}

export async function loadOrCreateMasterKey(filePath: string): Promise<Buffer> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    const existing = Buffer.from((await readFile(filePath, 'utf8')).trim(), 'base64');
    validateMasterKey(existing);
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const key = randomBytes(KEY_BYTES);
  const handle = await open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(`${key.toString('base64')}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  await chmod(filePath, 0o600);
  return key;
}

export class EncryptedFileKeyStore implements KeyStore {
  constructor(
    private readonly rootDir: string,
    private readonly masterKey: Buffer,
  ) {
    validateMasterKey(masterKey);
  }

  private filePath(keyRef: string): string {
    validateKeyRef(keyRef);
    return path.join(this.rootDir, `${keyRef}.json`);
  }

  async put(keyRef: string, privateKeyPem: string): Promise<void> {
    if (!privateKeyPem.includes('PRIVATE KEY')) {
      throw new Error('Keystore values must be PEM private keys');
    }
    const destination = this.filePath(keyRef);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(privateKeyPem, 'utf8'),
      cipher.final(),
    ]);
    const payload: EncryptedKeyFile = {
      version: 1,
      algorithm: ALGORITHM,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    const temporary = `${destination}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(payload)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, destination);
    await chmod(destination, 0o600);
  }

  async get(keyRef: string): Promise<string> {
    const raw = await readFile(this.filePath(keyRef), 'utf8');
    const payload = JSON.parse(raw) as Partial<EncryptedKeyFile>;
    if (
      payload.version !== 1
      || payload.algorithm !== ALGORITHM
      || typeof payload.iv !== 'string'
      || typeof payload.authTag !== 'string'
      || typeof payload.ciphertext !== 'string'
    ) {
      throw new Error('Encrypted key file has an unsupported format');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.masterKey,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async delete(keyRef: string): Promise<void> {
    await rm(this.filePath(keyRef), { force: true });
  }

  async exists(keyRef: string): Promise<boolean> {
    try {
      await readFile(this.filePath(keyRef));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
