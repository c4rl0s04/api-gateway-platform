import {
  access,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export const DOC_TYPES = [
  'map',
  'concept',
  'architecture',
  'package',
  'guide',
  'decision',
  'reference',
  'policy',
  'runbook',
];

const DOC_STATUSES = ['draft', 'current', 'needs-review', 'deprecated'];
const IMPLEMENTATION_STATUSES = [
  'implemented',
  'partial',
  'planned',
  'not-applicable',
];
const DECISION_STATUSES = ['proposed', 'accepted', 'superseded', 'rejected'];
const INDEX_RELATIVE_PATH = '00-map/Documentation Index.md';
const SKIPPED_DIRECTORIES = new Set(['.obsidian', '_templates', 'assets']);

function normalizePath(value) {
  return value.split(path.sep).join('/');
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) return [];
      return markdownFiles(absolute);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : [];
  }));
  return nested.flat().sort();
}

export function parseFrontmatter(raw, relativePath) {
  if (!raw.startsWith('---\n')) {
    throw new Error('frontmatter must start on the first line');
  }

  const closing = raw.indexOf('\n---\n', 4);
  if (closing === -1) {
    throw new Error('frontmatter is missing its closing delimiter');
  }

  const yamlSource = raw.slice(4, closing);
  const metadata = YAML.parse(yamlSource);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('frontmatter must contain a YAML object');
  }

  return {
    metadata,
    body: raw.slice(closing + 5),
    raw,
    relativePath,
  };
}

export async function loadVault(projectRoot) {
  const docsRoot = path.join(projectRoot, 'docs');
  const notes = [];
  const errors = [];

  for (const absolutePath of await markdownFiles(docsRoot)) {
    const relativePath = normalizePath(path.relative(docsRoot, absolutePath));
    const raw = await readFile(absolutePath, 'utf8');
    try {
      notes.push({
        ...parseFrontmatter(raw, relativePath),
        absolutePath,
      });
    } catch (error) {
      errors.push({
        file: relativePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { notes, errors };
}

function arrayOfStrings(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf())
    && date.toISOString().slice(0, 10) === value;
}

function noteStem(relativePath) {
  return relativePath.replace(/\.md$/i, '');
}

function lower(value) {
  return value.toLocaleLowerCase('en-US');
}

function addMapValue(map, key, note) {
  const normalized = lower(key);
  const current = map.get(normalized) ?? [];
  if (!current.some(candidate => candidate.relativePath === note.relativePath)) {
    current.push(note);
  }
  map.set(normalized, current);
}

function buildLinkMaps(notes) {
  const byPath = new Map();
  const byBasename = new Map();
  const byAlias = new Map();
  const byTitle = new Map();

  for (const note of notes) {
    const stem = noteStem(note.relativePath);
    addMapValue(byPath, stem, note);
    addMapValue(byBasename, path.posix.basename(stem), note);

    if (typeof note.metadata.title === 'string') {
      addMapValue(byTitle, note.metadata.title, note);
    }
    if (arrayOfStrings(note.metadata.aliases)) {
      for (const alias of note.metadata.aliases) addMapValue(byAlias, alias, note);
    }
  }

  return { byPath, byBasename, byAlias, byTitle };
}

function uniqueNotes(notes) {
  return [...new Map(notes.map(note => [note.relativePath, note])).values()];
}

function resolveWikiTarget(target, source, maps) {
  let clean = target.split('#')[0].split('^')[0].trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return [];
  }
  clean = clean.replace(/\.md$/i, '');
  if (!clean) return [source];

  const sourceDirectory = path.posix.dirname(source.relativePath);
  const candidates = [];
  const localPath = path.posix.normalize(path.posix.join(sourceDirectory, clean));
  const localMatches = maps.byPath.get(lower(localPath)) ?? [];
  if (localMatches.length > 0) return uniqueNotes(localMatches);

  if (clean.includes('/')) {
    candidates.push(...(maps.byPath.get(lower(clean)) ?? []));
  } else {
    candidates.push(...(maps.byBasename.get(lower(clean)) ?? []));
    candidates.push(...(maps.byAlias.get(lower(clean)) ?? []));
    candidates.push(...(maps.byTitle.get(lower(clean)) ?? []));
  }

  return uniqueNotes(candidates);
}

function wikiLinks(body) {
  const links = [];
  for (const match of body.matchAll(/\[\[([^\]]+)]]/g)) {
    links.push(match[1].split('|')[0].trim());
  }
  return links;
}

function markdownLinks(body) {
  const links = [];
  for (const match of body.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.includes('>')) {
      target = target.slice(1, target.indexOf('>'));
    } else {
      target = target.split(/\s+["']/)[0];
    }
    links.push(target);
  }
  return links;
}

function pushError(errors, note, message) {
  errors.push({ file: note.relativePath, message });
}

function validateMetadata(note, projectRoot, errors) {
  const { metadata, body } = note;
  const required = [
    'title',
    'type',
    'doc_status',
    'implementation_status',
    'last_verified',
    'tags',
    'sources',
    'aliases',
  ];

  for (const field of required) {
    if (!(field in metadata)) pushError(errors, note, `missing "${field}"`);
  }

  if (typeof metadata.title !== 'string' || metadata.title.trim() === '') {
    pushError(errors, note, '"title" must be a non-empty string');
  }
  if (!DOC_TYPES.includes(metadata.type)) {
    pushError(errors, note, `invalid type "${metadata.type}"`);
  }
  if (!DOC_STATUSES.includes(metadata.doc_status)) {
    pushError(errors, note, `invalid doc_status "${metadata.doc_status}"`);
  }
  if (!IMPLEMENTATION_STATUSES.includes(metadata.implementation_status)) {
    pushError(
      errors,
      note,
      `invalid implementation_status "${metadata.implementation_status}"`,
    );
  }
  if (!validIsoDate(metadata.last_verified)) {
    pushError(errors, note, '"last_verified" must be a valid YYYY-MM-DD date');
  }
  if (!arrayOfStrings(metadata.tags)) {
    pushError(errors, note, '"tags" must be an array of strings');
  } else {
    if (!metadata.tags.includes(`type/${metadata.type}`)) {
      pushError(errors, note, `missing tag "type/${metadata.type}"`);
    }
    if (!metadata.tags.some(tag => tag.startsWith('area/'))) {
      pushError(errors, note, 'at least one "area/*" tag is required');
    }
  }
  if (!arrayOfStrings(metadata.sources)) {
    pushError(errors, note, '"sources" must be an array of repository paths');
  }
  if (!arrayOfStrings(metadata.aliases)) {
    pushError(errors, note, '"aliases" must be an array of strings');
  }

  if (metadata.type === 'decision'
    && !DECISION_STATUSES.includes(metadata.decision_status)) {
    pushError(errors, note, `invalid decision_status "${metadata.decision_status}"`);
  }

  const h1 = body.match(/^# (.+)$/m);
  if (!h1) {
    pushError(errors, note, 'missing H1');
  } else if (h1[1] !== metadata.title) {
    pushError(
      errors,
      note,
      `H1 "${h1[1]}" does not match title "${metadata.title}"`,
    );
  }

  if (!/^> \[!summary\] At a glance\n> \S.+$/m.test(body)) {
    pushError(errors, note, 'missing a non-empty "At a glance" summary');
  }

  if (arrayOfStrings(metadata.sources)) {
    for (const source of metadata.sources) {
      if (/^https?:\/\//.test(source)) {
        pushError(errors, note, `source must be a local repository path: ${source}`);
        continue;
      }
      const absolute = path.resolve(projectRoot, source);
      const relative = path.relative(projectRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        pushError(errors, note, `source escapes the repository: ${source}`);
      }
    }
  }
}

async function validateSources(notes, projectRoot, errors) {
  for (const note of notes) {
    if (!arrayOfStrings(note.metadata.sources)) continue;
    for (const source of note.metadata.sources) {
      if (/^https?:\/\//.test(source)) continue;
      const absolute = path.resolve(projectRoot, source);
      if (!await exists(absolute)) {
        pushError(errors, note, `source does not exist: ${source}`);
      }
    }
  }
}

async function validateLinks(notes, projectRoot, errors) {
  const docsRoot = path.join(projectRoot, 'docs');
  const maps = buildLinkMaps(notes);

  for (const note of notes) {
    for (const target of wikiLinks(note.body)) {
      const matches = resolveWikiTarget(target, note, maps);
      if (matches.length === 0) {
        pushError(errors, note, `unresolved wikilink: [[${target}]]`);
      } else if (matches.length > 1) {
        pushError(
          errors,
          note,
          `ambiguous wikilink [[${target}]]: ${matches.map(item => item.relativePath).join(', ')}`,
        );
      }
    }

    for (const targetWithFragment of markdownLinks(note.body)) {
      if (/^(https?:|mailto:|#)/.test(targetWithFragment)) continue;
      let target = targetWithFragment.split('#')[0];
      try {
        target = decodeURIComponent(target);
      } catch {
        pushError(errors, note, `invalid encoded Markdown link: ${target}`);
        continue;
      }
      if (!target) continue;
      const absolute = path.resolve(
        path.dirname(path.join(docsRoot, note.relativePath)),
        target,
      );
      if (!await exists(absolute)) {
        pushError(errors, note, `local Markdown link does not exist: ${target}`);
      }
    }
  }
}

function staleWarnings(notes, now) {
  const warnings = [];
  const threshold = 90 * 24 * 60 * 60 * 1000;
  for (const note of notes) {
    if (!validIsoDate(note.metadata.last_verified)) continue;
    const verified = new Date(`${note.metadata.last_verified}T00:00:00Z`);
    if (now.valueOf() - verified.valueOf() > threshold) {
      warnings.push({
        file: note.relativePath,
        message: `last verified more than 90 days ago (${note.metadata.last_verified})`,
      });
    }
  }
  return warnings;
}

function orphanWarnings(notes) {
  const incoming = new Map(notes.map(note => [note.relativePath, 0]));
  const maps = buildLinkMaps(notes);

  for (const note of notes) {
    if (note.relativePath === INDEX_RELATIVE_PATH) continue;
    for (const target of wikiLinks(note.body)) {
      const matches = resolveWikiTarget(target, note, maps);
      if (matches.length === 1) {
        incoming.set(matches[0].relativePath, incoming.get(matches[0].relativePath) + 1);
      }
    }
  }

  return notes
    .filter(note =>
      note.metadata.type !== 'map'
      && note.relativePath !== INDEX_RELATIVE_PATH
      && incoming.get(note.relativePath) === 0)
    .map(note => ({
      file: note.relativePath,
      message: 'note has no incoming wikilinks outside the generated index',
    }));
}

function indexDate(notes) {
  const index = notes.find(note => note.relativePath === INDEX_RELATIVE_PATH);
  return validIsoDate(index?.metadata.last_verified)
    ? index.metadata.last_verified
    : new Date().toISOString().slice(0, 10);
}

export function renderIndex(notes, lastVerified = indexDate(notes)) {
  const labels = {
    map: 'Maps',
    concept: 'Concepts',
    architecture: 'Architecture',
    package: 'Packages',
    guide: 'Guides',
    decision: 'Decisions',
    reference: 'Reference',
    policy: 'Policies',
    runbook: 'Runbooks',
  };

  const content = [
    '---',
    'title: Documentation Index',
    'type: map',
    'doc_status: current',
    'implementation_status: not-applicable',
    `last_verified: ${lastVerified}`,
    'tags:',
    '  - type/map',
    '  - area/project',
    'sources:',
    '  - docs',
    'aliases: []',
    '---',
    '',
    '# Documentation Index',
    '',
    '> [!summary] At a glance',
    '> This generated index lists every content note with its documentation and implementation status.',
    '',
    '<!-- Generated by npm run docs:index. Do not edit manually. -->',
    '',
  ];

  const indexed = notes.filter(note => note.relativePath !== INDEX_RELATIVE_PATH);
  for (const type of DOC_TYPES) {
    const group = indexed
      .filter(note => note.metadata.type === type)
      .sort((a, b) => a.metadata.title.localeCompare(b.metadata.title, 'en'));
    if (group.length === 0) continue;

    content.push(`## ${labels[type]}`, '');
    content.push('| Note | Documentation | Implementation | Verified |');
    content.push('| --- | --- | --- | --- |');
    for (const note of group) {
      const target = note.relativePath === 'README.md'
        ? note.metadata.aliases[0]
        : noteStem(note.relativePath);
      content.push(
        `| [[${target}|${note.metadata.title}]] | ${note.metadata.doc_status} | `
        + `${note.metadata.implementation_status} | ${note.metadata.last_verified} |`,
      );
    }
    content.push('');
  }

  return `${content.join('\n').trimEnd()}\n`;
}

export async function updateIndex(projectRoot) {
  const docsRoot = path.join(projectRoot, 'docs');
  const indexPath = path.join(docsRoot, INDEX_RELATIVE_PATH);
  const { notes, errors } = await loadVault(projectRoot);
  if (errors.length > 0) {
    throw new Error(
      `Cannot generate index:\n${errors.map(error => `${error.file}: ${error.message}`).join('\n')}`,
    );
  }

  const existing = notes.find(note => note.relativePath === INDEX_RELATIVE_PATH);
  const existingDate = indexDate(notes);
  const candidate = renderIndex(notes, existingDate);
  if (existing?.raw === candidate) return { changed: false, path: indexPath };

  const today = new Date().toISOString().slice(0, 10);
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, renderIndex(notes, today), 'utf8');
  return { changed: true, path: indexPath };
}

export async function validateVault(
  projectRoot,
  {
    checkIndex = true,
    checkOrphans = true,
    now = new Date(),
  } = {},
) {
  const loaded = await loadVault(projectRoot);
  const errors = [...loaded.errors];
  const notes = loaded.notes;

  for (const note of notes) validateMetadata(note, projectRoot, errors);
  await validateSources(notes, projectRoot, errors);
  await validateLinks(notes, projectRoot, errors);

  if (checkIndex) {
    const index = notes.find(note => note.relativePath === INDEX_RELATIVE_PATH);
    if (!index) {
      errors.push({
        file: INDEX_RELATIVE_PATH,
        message: 'generated index is missing; run npm run docs:index',
      });
    } else {
      const expected = renderIndex(notes, index.metadata.last_verified);
      if (index.raw !== expected) {
        errors.push({
          file: INDEX_RELATIVE_PATH,
          message: 'generated index is stale; run npm run docs:index',
        });
      }
    }
  }

  const warnings = staleWarnings(notes, now);
  if (checkOrphans) warnings.push(...orphanWarnings(notes));
  return { errors, warnings, notes };
}
