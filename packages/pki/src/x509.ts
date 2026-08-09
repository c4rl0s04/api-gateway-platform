import {
  createPublicKey,
  randomBytes,
  X509Certificate,
} from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runOpenSsl } from './openssl.js';

const CLIENT_AUTH_OID = '1.3.6.1.5.5.7.3.2';
const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export interface CertificateMetadata {
  certificatePem: string;
  fingerprintSha256: string;
  serialNumber: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  expiresAt: Date;
  isCertificateAuthority: boolean;
}

export interface ManagedAuthorityMaterial extends CertificateMetadata {
  privateKeyPem: string;
}

function safeIdentifier(value: string, label: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return value;
}

function safeDnsName(value: string): string {
  if (value.startsWith('*.')) {
    const suffix = value.slice(2);
    if (!suffix.includes('.') || !SAFE_IDENTIFIER.test(suffix)) {
      throw new Error('DNS name contains unsupported characters');
    }
    return value;
  }
  return safeIdentifier(value, 'DNS name');
}

function certificateMetadata(certificatePem: string): CertificateMetadata {
  const certificate = new X509Certificate(certificatePem);
  return {
    certificatePem,
    fingerprintSha256: certificate.fingerprint256
      .replaceAll(':', '')
      .toLowerCase(),
    serialNumber: certificate.serialNumber.toLowerCase(),
    subject: certificate.subject,
    issuer: certificate.issuer,
    validFrom: new Date(certificate.validFrom),
    expiresAt: new Date(certificate.validTo),
    isCertificateAuthority: certificate.ca,
  };
}

async function withTemporaryDirectory<T>(
  operation: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'api-gateway-pki-'));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function createManagedAuthority(input: {
  commonName: string;
  validityDays?: number;
}): Promise<ManagedAuthorityMaterial> {
  const commonName = safeIdentifier(input.commonName, 'CA commonName');
  const validityDays = input.validityDays ?? 3_650;
  if (!Number.isInteger(validityDays) || validityDays < 365 || validityDays > 3_650) {
    throw new Error('CA validityDays must be between 365 and 3650');
  }

  return withTemporaryDirectory(async (directory) => {
    const keyPath = path.join(directory, 'ca.key');
    const certificatePath = path.join(directory, 'ca.crt');
    await runOpenSsl([
      'req',
      '-x509',
      '-newkey',
      'rsa:3072',
      '-nodes',
      '-sha256',
      '-days',
      String(validityDays),
      '-subj',
      `/CN=${commonName}`,
      '-addext',
      'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
    ]);
    const [privateKeyPem, certificatePem] = await Promise.all([
      readFile(keyPath, 'utf8'),
      readFile(certificatePath, 'utf8'),
    ]);
    return {
      privateKeyPem,
      ...certificateMetadata(certificatePem),
    };
  });
}

export async function createClientCertificateRequest(input: {
  credentialId: string;
  algorithm?: 'rsa' | 'ec';
}): Promise<{ privateKeyPem: string; csrPem: string }> {
  const credentialId = safeIdentifier(input.credentialId, 'credentialId');
  const algorithm = input.algorithm ?? 'rsa';
  return withTemporaryDirectory(async (directory) => {
    const keyPath = path.join(directory, 'client.key');
    const csrPath = path.join(directory, 'client.csr');
    const keyArguments = algorithm === 'rsa'
      ? ['-newkey', 'rsa:2048']
      : ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256'];
    await runOpenSsl([
      'req',
      '-new',
      ...keyArguments,
      '-nodes',
      '-sha256',
      '-subj',
      `/CN=${credentialId}`,
      '-keyout',
      keyPath,
      '-out',
      csrPath,
    ]);
    return {
      privateKeyPem: await readFile(keyPath, 'utf8'),
      csrPem: await readFile(csrPath, 'utf8'),
    };
  });
}

async function validateCsr(csrPath: string): Promise<void> {
  await runOpenSsl(['req', '-in', csrPath, '-noout', '-verify']);
  const { stdout } = await runOpenSsl(['req', '-in', csrPath, '-pubkey', '-noout']);
  const key = createPublicKey(stdout);
  if (key.asymmetricKeyType === 'rsa') {
    if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2_048) {
      throw new Error('CSR RSA key must contain at least 2048 bits');
    }
    return;
  }
  if (key.asymmetricKeyType === 'ec') {
    const curve = key.asymmetricKeyDetails?.namedCurve;
    if (!['prime256v1', 'secp384r1'].includes(curve ?? '')) {
      throw new Error('CSR EC key must use P-256 or P-384');
    }
    return;
  }
  throw new Error('CSR key must use RSA, P-256, or P-384');
}

export async function issueClientCertificate(input: {
  csrPem: string;
  authorityCertificatePem: string;
  authorityPrivateKeyPem: string;
  organizationId: string;
  appId: string;
  credentialId: string;
  validityDays?: number;
}): Promise<CertificateMetadata> {
  const organizationId = safeIdentifier(input.organizationId, 'organizationId');
  const appId = safeIdentifier(input.appId, 'appId');
  const credentialId = safeIdentifier(input.credentialId, 'credentialId');
  const validityDays = input.validityDays ?? 90;
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 365) {
    throw new Error('Client certificate validityDays must be between 1 and 365');
  }

  return withTemporaryDirectory(async (directory) => {
    const csrPath = path.join(directory, 'client.csr');
    const caCertificatePath = path.join(directory, 'ca.crt');
    const caKeyPath = path.join(directory, 'ca.key');
    const certificatePath = path.join(directory, 'client.crt');
    const extensionsPath = path.join(directory, 'client.ext');
    await Promise.all([
      writeFile(csrPath, input.csrPem, { mode: 0o600 }),
      writeFile(caCertificatePath, input.authorityCertificatePem, { mode: 0o600 }),
      writeFile(caKeyPath, input.authorityPrivateKeyPem, { mode: 0o600 }),
      writeFile(
        extensionsPath,
        [
          'basicConstraints=critical,CA:FALSE',
          'keyUsage=critical,digitalSignature',
          'extendedKeyUsage=clientAuth',
          `subjectAltName=URI:urn:api-gateway:org:${organizationId}:app:${appId}:credential:${credentialId}`,
          '',
        ].join('\n'),
        { mode: 0o600 },
      ),
    ]);
    await validateCsr(csrPath);
    const serial = randomBytes(16).toString('hex');
    await runOpenSsl([
      'x509',
      '-req',
      '-sha256',
      '-days',
      String(validityDays),
      '-in',
      csrPath,
      '-CA',
      caCertificatePath,
      '-CAkey',
      caKeyPath,
      '-set_serial',
      `0x${serial}`,
      '-extfile',
      extensionsPath,
      '-out',
      certificatePath,
    ]);
    const certificatePem = await readFile(certificatePath, 'utf8');
    const metadata = certificateMetadata(certificatePem);
    if (metadata.isCertificateAuthority) {
      throw new Error('Issued client certificate cannot be a CA');
    }
    return metadata;
  });
}

export async function issueServerCertificate(input: {
  csrPem: string;
  authorityCertificatePem: string;
  authorityPrivateKeyPem: string;
  dnsNames: string[];
  ipAddresses?: string[];
  validityDays?: number;
}): Promise<CertificateMetadata> {
  const validityDays = input.validityDays ?? 825;
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 825) {
    throw new Error('Server certificate validityDays must be between 1 and 825');
  }
  const dnsNames = input.dnsNames.map(safeDnsName);
  const ipAddresses = input.ipAddresses ?? [];
  for (const address of ipAddresses) {
    if (!/^[0-9a-fA-F:.]+$/.test(address)) {
      throw new Error('IP address contains unsupported characters');
    }
  }

  return withTemporaryDirectory(async (directory) => {
    const csrPath = path.join(directory, 'server.csr');
    const caCertificatePath = path.join(directory, 'ca.crt');
    const caKeyPath = path.join(directory, 'ca.key');
    const certificatePath = path.join(directory, 'server.crt');
    const extensionsPath = path.join(directory, 'server.ext');
    const subjectAltNames = [
      ...dnsNames.map(name => `DNS:${name}`),
      ...ipAddresses.map(address => `IP:${address}`),
    ];
    await Promise.all([
      writeFile(csrPath, input.csrPem, { mode: 0o600 }),
      writeFile(caCertificatePath, input.authorityCertificatePem, { mode: 0o600 }),
      writeFile(caKeyPath, input.authorityPrivateKeyPem, { mode: 0o600 }),
      writeFile(extensionsPath, [
        'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage=serverAuth',
        `subjectAltName=${subjectAltNames.join(',')}`,
        '',
      ].join('\n'), { mode: 0o600 }),
    ]);
    await validateCsr(csrPath);
    await runOpenSsl([
      'x509',
      '-req',
      '-sha256',
      '-days',
      String(validityDays),
      '-in',
      csrPath,
      '-CA',
      caCertificatePath,
      '-CAkey',
      caKeyPath,
      '-set_serial',
      `0x${randomBytes(16).toString('hex')}`,
      '-extfile',
      extensionsPath,
      '-out',
      certificatePath,
    ]);
    return certificateMetadata(await readFile(certificatePath, 'utf8'));
  });
}

export async function validateExternalClientCertificate(input: {
  certificatePem: string;
  authorityCertificatePem: string;
  chainPem?: string | null;
}): Promise<CertificateMetadata> {
  return withTemporaryDirectory(async (directory) => {
    const certificatePath = path.join(directory, 'client.crt');
    const caPath = path.join(directory, 'ca.crt');
    await Promise.all([
      writeFile(certificatePath, input.certificatePem, { mode: 0o600 }),
      writeFile(caPath, input.authorityCertificatePem, { mode: 0o600 }),
    ]);
    const args = ['verify', '-purpose', 'sslclient', '-CAfile', caPath];
    if (input.chainPem) {
      const chainPath = path.join(directory, 'chain.crt');
      await writeFile(chainPath, input.chainPem, { mode: 0o600 });
      args.push('-untrusted', chainPath);
    }
    args.push(certificatePath);
    await runOpenSsl(args);

    const metadata = certificateMetadata(input.certificatePem);
    if (metadata.isCertificateAuthority) {
      throw new Error('Client certificate cannot be a CA');
    }
    const certificate = new X509Certificate(input.certificatePem);
    const usages = certificate.keyUsage ?? [];
    if (!usages.includes(CLIENT_AUTH_OID)) {
      throw new Error('Certificate must allow TLS client authentication');
    }
    return metadata;
  });
}

export function inspectCertificate(certificatePem: string): CertificateMetadata {
  return certificateMetadata(certificatePem);
}
