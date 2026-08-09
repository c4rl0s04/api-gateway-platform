import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

describe('lab BFF contract', () => {
  it('maps browser routes to the separate lab API namespace', async () => {
    const source = await readFile(
      new URL('../app/api/lab/[...path]/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(source, /`\/lab\/v1\/\$\{context\.params\.path\.join\('\/'\)\}`/u);
    assert.doesNotMatch(source, /`\/v1\/\$\{context/u);
    assert.match(source, /management_access_token/u);
    assert.match(source, /authorization: `Bearer \$\{token\}`/u);
  });
});
