import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { updateIndex, validateVault } from './docs-tools.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'api-gateway-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'docs', '01-concepts'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{}\n');
  return root;
}

function note({
  title = 'Valid Note',
  type = 'concept',
  date = '2026-07-27',
  sources = ['package.json'],
  aliases = [],
  body = '',
} = {}) {
  return `---
title: ${JSON.stringify(title)}
type: ${type}
doc_status: current
implementation_status: not-applicable
last_verified: ${date}
tags:
  - type/${type}
  - area/project
${sources.length > 0
    ? `sources:\n${sources.map(source => `  - ${source}`).join('\n')}`
    : 'sources: []'}
${aliases.length > 0
    ? `aliases:\n${aliases.map(alias => `  - ${alias}`).join('\n')}`
    : 'aliases: []'}
---

# ${title}

> [!summary] At a glance
> A useful fixture summary.

${body}
`;
}

test('accepts valid metadata and resolves an alias', async t => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, 'docs', '01-concepts', 'Target.md'),
    note({ title: 'Target', aliases: ['Previous Target'] }),
  );
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    note({ title: 'Home', type: 'map', body: 'See [[Previous Target]].' }),
  );

  const result = await validateVault(root, {
    checkIndex: false,
    checkOrphans: false,
  });
  assert.deepEqual(result.errors, []);
});

test('rejects a note without frontmatter', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'docs', 'Broken.md'), '# Broken\n');
  const result = await validateVault(root, {
    checkIndex: false,
    checkOrphans: false,
  });
  assert.match(result.errors[0].message, /frontmatter/);
});

test('rejects invalid enum and date values', async t => {
  const root = await fixture(t);
  const invalid = note({ type: 'concept', date: '2026-99-40' })
    .replace('type: concept', 'type: unknown')
    .replace('type/unknown', 'type/concept');
  await writeFile(path.join(root, 'docs', 'Invalid.md'), invalid);
  const result = await validateVault(root, {
    checkIndex: false,
    checkOrphans: false,
  });
  assert(result.errors.some(error => /invalid type/.test(error.message)));
  assert(result.errors.some(error => /last_verified/.test(error.message)));
});

test('rejects broken wikilinks and missing sources', async t => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, 'docs', 'Broken.md'),
    note({ sources: ['missing.ts'], body: 'See [[Missing Note]].' }),
  );
  const result = await validateVault(root, {
    checkIndex: false,
    checkOrphans: false,
  });
  assert(result.errors.some(error => /source does not exist/.test(error.message)));
  assert(result.errors.some(error => /unresolved wikilink/.test(error.message)));
});

test('rejects an ambiguous wikilink', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'docs', '02-architecture'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', '01-concepts', 'Duplicate.md'),
    note({ title: 'Concept Duplicate' }),
  );
  await writeFile(
    path.join(root, 'docs', '02-architecture', 'Duplicate.md'),
    note({ title: 'Architecture Duplicate', type: 'architecture' }),
  );
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    note({ title: 'Home', type: 'map', body: 'See [[Duplicate]].' }),
  );
  const result = await validateVault(root, {
    checkIndex: false,
    checkOrphans: false,
  });
  assert(result.errors.some(error => /ambiguous wikilink/.test(error.message)));
});

test('detects a stale generated index', async t => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    note({ title: 'Home', type: 'map' }),
  );
  await updateIndex(root);
  await writeFile(
    path.join(root, 'docs', '01-concepts', 'Added Later.md'),
    note({ title: 'Added Later' }),
  );

  const result = await validateVault(root, {
    checkOrphans: false,
  });
  assert(result.errors.some(error => /index is stale/.test(error.message)));

  await updateIndex(root);
  const index = await readFile(
    path.join(root, 'docs', '00-map', 'Documentation Index.md'),
    'utf8',
  );
  assert.match(index, /Added Later/);
});

test('renders clickable wikilinks without splitting generated table cells', async t => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    note({ title: 'Home', type: 'map', aliases: ['Documentation Home'] }),
  );
  await writeFile(
    path.join(root, 'docs', '01-concepts', 'Table Target.md'),
    note({ title: 'Table | Target' }),
  );

  const firstUpdate = await updateIndex(root);
  const secondUpdate = await updateIndex(root);
  const index = await readFile(
    path.join(root, 'docs', '00-map', 'Documentation Index.md'),
    'utf8',
  );
  const targetRow = index.split('\n').find(line => line.includes('Table Target'));

  assert.equal(firstUpdate.changed, true);
  assert.equal(secondUpdate.changed, false);
  assert.match(targetRow, /\[\[01-concepts\/Table Target\\\|Table \\\| Target]]/);
  assert.equal(targetRow.match(/(?<!\\)\|/g)?.length, 5);

  const validation = await validateVault(root, { checkOrphans: false });
  assert.deepEqual(validation.errors, []);
});
