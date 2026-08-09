import {
  DEPLOYMENT_REGIONS,
  DEPLOYMENT_STAGES,
} from '../packages/shared/dist/index.js';
import {
  EncryptedFileKeyStore,
  createClientCertificateRequest,
  createManagedAuthority,
  generateCertificateRevocationList,
  inspectCertificate,
  issueClientCertificate,
  issueServerCertificate,
  loadOrCreateMasterKey,
} from '../packages/pki/dist/index.js';
import { X509Certificate } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.local-secrets');
const pkiDir = path.join(root, 'pki');
const authorityDir = path.join(pkiDir, 'authorities', 'local-development');
const ingressDir = path.join(root, 'ingress');
const clientsDir = path.join(root, 'clients');
const authorityCertificateFile = path.join(authorityDir, 'ca.crt');
const keyRef = 'authorities/local-development';
const gatewayDnsNames = [
  'localhost',
  '*.lab.gateway.localhost',
  ...DEPLOYMENT_STAGES.flatMap(stage =>
    DEPLOYMENT_REGIONS.map(region =>
      `${stage}-${region}.gateway.localhost`)),
];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

await Promise.all([
  mkdir(authorityDir, { recursive: true }),
  mkdir(ingressDir, { recursive: true }),
  mkdir(clientsDir, { recursive: true }),
]);
const masterKey = await loadOrCreateMasterKey(path.join(pkiDir, 'master.key'));
const keyStore = new EncryptedFileKeyStore(
  path.join(pkiDir, 'keystore'),
  masterKey,
);

let authorityCertificatePem;
let authorityPrivateKeyPem;
if (
  await exists(authorityCertificateFile)
  && await keyStore.exists(keyRef)
) {
  [authorityCertificatePem, authorityPrivateKeyPem] = await Promise.all([
    readFile(authorityCertificateFile, 'utf8'),
    keyStore.get(keyRef),
  ]);
} else {
  const authority = await createManagedAuthority({
    commonName: 'api-gateway-local-development-ca',
  });
  authorityCertificatePem = authority.certificatePem;
  authorityPrivateKeyPem = authority.privateKeyPem;
  await Promise.all([
    writeFile(authorityCertificateFile, authority.certificatePem, { mode: 0o644 }),
    keyStore.put(keyRef, authority.privateKeyPem),
  ]);
}
const authoritySubject = inspectCertificate(authorityCertificatePem).subject;

async function isIssuedByCurrentAuthority(certificateFile) {
  if (!await exists(certificateFile)) return false;
  try {
    return inspectCertificate(
      await readFile(certificateFile, 'utf8'),
    ).issuer === authoritySubject;
  } catch {
    return false;
  }
}

const serverCertificateFile = path.join(ingressDir, 'server.crt');
const serverKeyFile = path.join(ingressDir, 'server.key');
async function serverCertificateIsCurrent() {
  if (!await isIssuedByCurrentAuthority(serverCertificateFile)) {
    return false;
  }
  try {
    const certificate = new X509Certificate(
      await readFile(serverCertificateFile, 'utf8'),
    );
    return gatewayDnsNames.every(name => certificate.checkHost(name));
  } catch {
    return false;
  }
}

if (
  !await serverCertificateIsCurrent()
  || !await exists(serverKeyFile)
) {
  const request = await createClientCertificateRequest({
    credentialId: 'localhost',
  });
  const certificate = await issueServerCertificate({
    csrPem: request.csrPem,
    authorityCertificatePem,
    authorityPrivateKeyPem,
    dnsNames: gatewayDnsNames,
    ipAddresses: ['127.0.0.1'],
  });
  await Promise.all([
    writeFile(serverCertificateFile, certificate.certificatePem, { mode: 0o644 }),
    writeFile(serverKeyFile, request.privateKeyPem, { mode: 0o600 }),
    writeFile(path.join(ingressDir, 'server.csr'), request.csrPem, { mode: 0o644 }),
  ]);
}

const clients = [
  {
    credentialId: 'cred-bank-001',
    appId: 'app-bank-partner',
    directory: 'cred-bank-001',
  },
  {
    credentialId: 'cred-bank-002',
    appId: 'app-bank-partner-secondary',
    directory: 'cred-bank-002',
  },
];
const output = {
  authority: {
    ...inspectCertificate(authorityCertificatePem),
    certificatePem: authorityCertificatePem,
    keyRef,
  },
  clients: [],
};
for (const client of clients) {
  const directory = path.join(clientsDir, client.directory);
  const certificateFile = path.join(directory, 'client.crt');
  const keyFile = path.join(directory, 'client.key');
  await mkdir(directory, { recursive: true });
  if (
    !await isIssuedByCurrentAuthority(certificateFile)
    || !await exists(keyFile)
  ) {
    const request = await createClientCertificateRequest({
      credentialId: client.credentialId,
    });
    const certificate = await issueClientCertificate({
      csrPem: request.csrPem,
      authorityCertificatePem,
      authorityPrivateKeyPem,
      organizationId: 'org-bank-dev',
      appId: client.appId,
      credentialId: client.credentialId,
      validityDays: 365,
    });
    await Promise.all([
      writeFile(certificateFile, certificate.certificatePem, { mode: 0o644 }),
      writeFile(keyFile, request.privateKeyPem, { mode: 0o600 }),
      writeFile(path.join(directory, 'client.csr'), request.csrPem, { mode: 0o644 }),
    ]);
  }
  const certificatePem = await readFile(certificateFile, 'utf8');
  const metadata = inspectCertificate(certificatePem);
  await writeFile(
    path.join(directory, 'fingerprint.sha256'),
    `${metadata.fingerprintSha256}\n`,
  );
  output.clients.push({
    ...client,
    ...metadata,
    certificatePem,
  });
}

const crl = await generateCertificateRevocationList({
  authorityCertificatePem,
  authorityPrivateKeyPem,
  revokedCertificates: [],
});
await Promise.all([
  writeFile(path.join(pkiDir, 'trust-bundle.pem'), authorityCertificatePem),
  writeFile(path.join(pkiDir, 'crl-bundle.pem'), crl.pem),
  writeFile(
    path.join(pkiDir, 'bootstrap.json'),
    `${JSON.stringify({
      ...output,
      crl: {
        pem: crl.pem,
        lastUpdate: crl.lastUpdate,
        nextUpdate: crl.nextUpdate,
      },
    }, null, 2)}\n`,
    { mode: 0o600 },
  ),
]);

for (const legacy of [
  'mtls-ca.crt',
  'mtls-ca.key',
  'mtls-ca.srl',
  'mtls-client.crt',
  'mtls-client.csr',
  'mtls-client.ext',
  'mtls-client.key',
  'mtls-client.sha256',
  'mtls-client-second.crt',
  'mtls-client-second.csr',
  'mtls-client-second.ext',
  'mtls-client-second.key',
  'mtls-client-second.sha256',
  'mtls-server.crt',
  'mtls-server.csr',
  'mtls-server.ext',
  'mtls-server.key',
]) {
  await rm(path.join(root, legacy), { force: true });
}
