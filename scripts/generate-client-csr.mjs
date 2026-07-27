#!/usr/bin/env node

import { generateClientKeyAndCsr } from '../packages/pki/dist/index.js';
import path from 'node:path';

const [credentialId, algorithm = 'rsa'] = process.argv.slice(2);
if (!credentialId || !['rsa', 'ec'].includes(algorithm)) {
  console.error('Usage: npm run pki:client -- <credential-id> [rsa|ec]');
  process.exit(1);
}

try {
  const generated = await generateClientKeyAndCsr({
    clientsDirectory: path.resolve(
      process.env.LOCAL_SECRETS_DIR ?? '.local-secrets',
      'clients',
    ),
    credentialId,
    algorithm,
  });
  console.log(`Private key: ${generated.keyFile}`);
  console.log(`CSR: ${generated.csrFile}`);
} catch (error) {
  console.error((error).message);
  process.exit(1);
}
