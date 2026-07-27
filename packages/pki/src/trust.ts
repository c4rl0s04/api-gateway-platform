import { X509Certificate } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runOpenSsl } from './openssl.js';

export interface TrustedAuthority {
  id: string;
  certificatePem: string;
  status: 'active' | 'retiring';
  crlPem?: string | null;
  crlNextUpdate?: Date | null;
}

export interface RevokedCertificate {
  serialNumber: string;
  expiresAt: Date;
  revokedAt: Date;
  reason?: 'unspecified' | 'keyCompromise' | 'cessationOfOperation';
}

export interface CertificateRevocationList {
  pem: string;
  issuer: string;
  lastUpdate: Date;
  nextUpdate: Date;
}

function normalizePem(value: string): string {
  return `${value.trim()}\n`;
}

function opensslDate(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new Error('CRL dates must be valid');
  }
  const year = value.getUTCFullYear();
  const prefix = year >= 2050
    ? String(year)
    : String(year).slice(-2);
  return [
    prefix,
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
    String(value.getUTCHours()).padStart(2, '0'),
    String(value.getUTCMinutes()).padStart(2, '0'),
    String(value.getUTCSeconds()).padStart(2, '0'),
    'Z',
  ].join('');
}

function parseOpenSslDate(value: string): Date {
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`OpenSSL returned an invalid date: ${value.trim()}`);
  }
  return parsed;
}

async function temporaryDirectory<T>(
  operation: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'api-gateway-crl-'));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function buildTrustBundle(
  authorities: TrustedAuthority[],
  now = new Date(),
): { caBundlePem: string; crlBundlePem: string } {
  const sorted = [...authorities].sort((left, right) =>
    left.id.localeCompare(right.id));
  const certificates: string[] = [];
  const crls: string[] = [];

  for (const authority of sorted) {
    const certificate = new X509Certificate(authority.certificatePem);
    if (!certificate.ca) {
      throw new Error(`Authority ${authority.id} is not a CA certificate`);
    }
    if (new Date(certificate.validFrom) > now || new Date(certificate.validTo) <= now) {
      throw new Error(`Authority ${authority.id} is outside its validity period`);
    }
    if (authority.crlPem) {
      if (!authority.crlNextUpdate || authority.crlNextUpdate <= now) {
        throw new Error(`Authority ${authority.id} has an expired CRL`);
      }
      crls.push(normalizePem(authority.crlPem));
    }
    certificates.push(normalizePem(authority.certificatePem));
  }

  return {
    caBundlePem: certificates.join(''),
    crlBundlePem: crls.join(''),
  };
}

export async function generateCertificateRevocationList(input: {
  authorityCertificatePem: string;
  authorityPrivateKeyPem: string;
  revokedCertificates: RevokedCertificate[];
  validityDays?: number;
}): Promise<CertificateRevocationList> {
  const validityDays = input.validityDays ?? 7;
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 30) {
    throw new Error('CRL validityDays must be between 1 and 30');
  }

  return temporaryDirectory(async (directory) => {
    const certificatePath = path.join(directory, 'ca.crt');
    const privateKeyPath = path.join(directory, 'ca.key');
    const databasePath = path.join(directory, 'index.txt');
    const configPath = path.join(directory, 'openssl.cnf');
    const crlPath = path.join(directory, 'ca.crl');
    const database = input.revokedCertificates
      .map((certificate) => {
        const serial = certificate.serialNumber.replace(/^0x/i, '').toUpperCase();
        if (!/^[0-9A-F]+$/.test(serial)) {
          throw new Error(`Invalid certificate serial: ${certificate.serialNumber}`);
        }
        const reason = certificate.reason ?? 'unspecified';
        return [
          'R',
          opensslDate(certificate.expiresAt),
          `${opensslDate(certificate.revokedAt)},${reason}`,
          serial,
          'unknown',
          `/CN=revoked-${serial}`,
        ].join('\t');
      })
      .join('\n');
    const config = [
      '[ ca ]',
      'default_ca = gateway_ca',
      '[ gateway_ca ]',
      `database = ${databasePath}`,
      `certificate = ${certificatePath}`,
      `private_key = ${privateKeyPath}`,
      `default_crl_days = ${validityDays}`,
      'default_md = sha256',
      'unique_subject = no',
      '',
    ].join('\n');
    await Promise.all([
      writeFile(certificatePath, input.authorityCertificatePem, { mode: 0o600 }),
      writeFile(privateKeyPath, input.authorityPrivateKeyPem, { mode: 0o600 }),
      writeFile(databasePath, database ? `${database}\n` : '', { mode: 0o600 }),
      writeFile(configPath, config, { mode: 0o600 }),
    ]);
    await runOpenSsl([
      'ca',
      '-gencrl',
      '-config',
      configPath,
      '-out',
      crlPath,
      '-batch',
    ]);
    return validateCertificateRevocationList({
      crl: await readFile(crlPath),
      authorityCertificatePem: input.authorityCertificatePem,
    });
  });
}

export async function validateCertificateRevocationList(input: {
  crl: string | Buffer;
  authorityCertificatePem: string;
}): Promise<CertificateRevocationList> {
  return temporaryDirectory(async (directory) => {
    const sourcePath = path.join(directory, 'source.crl');
    const pemPath = path.join(directory, 'validated.crl');
    const authorityPath = path.join(directory, 'ca.crt');
    await Promise.all([
      writeFile(sourcePath, input.crl, { mode: 0o600 }),
      writeFile(authorityPath, input.authorityCertificatePem, { mode: 0o600 }),
    ]);

    let format: 'PEM' | 'DER' = 'PEM';
    try {
      await runOpenSsl(['crl', '-in', sourcePath, '-noout']);
    } catch {
      format = 'DER';
    }
    await runOpenSsl([
      'crl',
      '-inform',
      format,
      '-in',
      sourcePath,
      '-outform',
      'PEM',
      '-out',
      pemPath,
    ]);
    await runOpenSsl([
      'crl',
      '-in',
      pemPath,
      '-noout',
      '-verify',
      '-CAfile',
      authorityPath,
    ]);
    const details = await runOpenSsl([
      'crl',
      '-in',
      pemPath,
      '-noout',
      '-issuer',
      '-lastupdate',
      '-nextupdate',
    ]);
    const values = new Map(
      details.stdout.trim().split('\n').map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
    );
    const lastUpdate = parseOpenSslDate(values.get('lastUpdate') ?? '');
    const nextUpdate = parseOpenSslDate(values.get('nextUpdate') ?? '');
    if (nextUpdate <= new Date()) {
      throw new Error('CRL has expired');
    }
    return {
      pem: await readFile(pemPath, 'utf8'),
      issuer: values.get('issuer')?.trim() ?? '',
      lastUpdate,
      nextUpdate,
    };
  });
}

export async function downloadExternalCertificateRevocationList(input: {
  url: string;
  authorityCertificatePem: string;
  fetchImpl?: typeof fetch;
}): Promise<CertificateRevocationList> {
  const url = new URL(input.url);
  if (url.protocol !== 'https:') {
    throw new Error('External CRL URL must use HTTPS');
  }
  const response = await (input.fetchImpl ?? fetch)(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`External CRL download failed with HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 5 * 1024 * 1024) {
    throw new Error('External CRL exceeds the 5 MiB limit');
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 5 * 1024 * 1024) {
    throw new Error('External CRL exceeds the 5 MiB limit');
  }
  return validateCertificateRevocationList({
    crl: body,
    authorityCertificatePem: input.authorityCertificatePem,
  });
}
