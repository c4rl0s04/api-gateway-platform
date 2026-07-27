import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClientCertificateRequest } from './x509.js';

const SAFE_CREDENTIAL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function generateClientKeyAndCsr(input: {
  clientsDirectory: string;
  credentialId: string;
  algorithm?: 'rsa' | 'ec';
}): Promise<{ directory: string; keyFile: string; csrFile: string }> {
  if (!SAFE_CREDENTIAL_ID.test(input.credentialId)) {
    throw new Error('credentialId contains unsupported characters');
  }
  const directory = path.join(input.clientsDirectory, input.credentialId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const request = await createClientCertificateRequest({
    credentialId: input.credentialId,
    algorithm: input.algorithm,
  });
  const keyFile = path.join(directory, 'client.key');
  const csrFile = path.join(directory, 'client.csr');
  await writeFile(keyFile, request.privateKeyPem, {
    mode: 0o600,
    flag: 'wx',
  });
  try {
    await writeFile(csrFile, request.csrPem, {
      mode: 0o644,
      flag: 'wx',
    });
  } catch (error) {
    const { rm } = await import('node:fs/promises');
    await rm(keyFile, { force: true });
    throw error;
  }
  return { directory, keyFile, csrFile };
}
