import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { generateClientKeyAndCsr } from '../src/client-files.js';

describe('client key and CSR files', () => {
  it('creates private material locally and refuses to overwrite it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gateway-client-'));
    try {
      const generated = await generateClientKeyAndCsr({
        clientsDirectory: directory,
        credentialId: 'credential-test',
        algorithm: 'ec',
      });
      assert.match(await readFile(generated.keyFile, 'utf8'), /PRIVATE KEY/);
      assert.match(await readFile(generated.csrFile, 'utf8'), /CERTIFICATE REQUEST/);
      assert.equal((await stat(generated.keyFile)).mode & 0o777, 0o600);
      await assert.rejects(() => generateClientKeyAndCsr({
        clientsDirectory: directory,
        credentialId: 'credential-test',
      }), /EEXIST/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
