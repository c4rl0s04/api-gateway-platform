export type RequestExampleSource = 'explicit' | 'schema';

export interface OpenApiRequestExample {
  name: string;
  body: string;
  source: RequestExampleSource;
}

export interface OpenApiRequestBody {
  required: boolean;
  mediaType: string;
  examples: OpenApiRequestExample[];
}

const MAX_SCHEMA_DEPTH = 6;
const MAX_OBJECT_PROPERTIES = 30;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pointerValue(document: unknown, reference: string): unknown {
  if (!reference.startsWith('#/')) return undefined;
  return reference.slice(2).split('/').reduce<unknown>((current, segment) => {
    if (!record(current)) return undefined;
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    return current[key];
  }, document);
}

function resolvedObject(
  document: unknown,
  value: unknown,
  references = new Set<string>(),
): Record<string, unknown> | null {
  if (!record(value)) return null;
  if (typeof value.$ref !== 'string') return value;
  if (references.has(value.$ref)) return null;
  const nextReferences = new Set(references).add(value.$ref);
  const resolved = resolvedObject(document, pointerValue(document, value.$ref), nextReferences);
  if (!resolved) return null;
  const { $ref: _reference, ...siblings } = value;
  return { ...resolved, ...siblings };
}

function formattedString(format: unknown): string {
  switch (format) {
    case 'date': return '2026-01-15';
    case 'date-time': return '2026-01-15T10:30:00Z';
    case 'email': return 'user@example.com';
    case 'hostname': return 'api.example.com';
    case 'ipv4': return '192.0.2.1';
    case 'uri': return 'https://example.com/resource';
    case 'uuid': return '00000000-0000-4000-8000-000000000000';
    default: return 'string';
  }
}

function schemaExample(
  document: unknown,
  rawSchema: unknown,
  depth = 0,
  references = new Set<string>(),
): unknown {
  if (depth > MAX_SCHEMA_DEPTH) return undefined;
  if (!record(rawSchema)) return undefined;
  let schema = rawSchema;
  if (typeof rawSchema.$ref === 'string') {
    if (references.has(rawSchema.$ref)) return undefined;
    const resolved = resolvedObject(document, rawSchema, references);
    if (!resolved) return undefined;
    schema = resolved;
    references = new Set(references).add(rawSchema.$ref);
  }
  if (Object.hasOwn(schema, 'example')) return schema.example;
  if (Object.hasOwn(schema, 'default')) return schema.default;
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  for (const composition of ['oneOf', 'anyOf'] as const) {
    const candidates = schema[composition];
    if (Array.isArray(candidates) && candidates.length > 0) {
      return schemaExample(document, candidates[0], depth + 1, references);
    }
  }
  if (Array.isArray(schema.allOf)) {
    const values = schema.allOf.map(candidate =>
      schemaExample(document, candidate, depth + 1, references));
    if (values.every(record)) return Object.assign({}, ...values);
    return values.find(value => value !== undefined);
  }
  const properties = record(schema.properties) ? schema.properties : null;
  if (schema.type === 'object' || properties) {
    return Object.fromEntries(Object.entries(properties ?? {})
      .slice(0, MAX_OBJECT_PROPERTIES)
      .flatMap(([name, property]) => {
        const example = schemaExample(document, property, depth + 1, references);
        return example === undefined ? [] : [[name, example]];
      }));
  }
  if (schema.type === 'array') {
    const item = schemaExample(document, schema.items, depth + 1, references);
    return item === undefined ? [] : [item];
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    return typeof schema.minimum === 'number' ? schema.minimum : 0;
  }
  if (schema.type === 'boolean') return true;
  if (schema.type === 'null') return null;
  return formattedString(schema.format);
}

function serializeExample(mediaType: string, value: unknown): string | null {
  if (mediaType === 'application/x-www-form-urlencoded' && record(value)) {
    const form = new URLSearchParams();
    for (const [name, entry] of Object.entries(value)) {
      form.set(name, typeof entry === 'string' ? entry : JSON.stringify(entry));
    }
    return form.toString();
  }
  if (mediaType.includes('json') || mediaType.endsWith('+json')) {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'string') return value;
  if (mediaType.startsWith('text/')) return String(value ?? '');
  return value === undefined ? null : JSON.stringify(value, null, 2);
}

function examplesForMediaType(
  document: unknown,
  mediaType: string,
  rawMedia: unknown,
): OpenApiRequestExample[] {
  const media = resolvedObject(document, rawMedia);
  if (!media) return [];
  const examples: OpenApiRequestExample[] = [];
  if (Object.hasOwn(media, 'example')) {
    const body = serializeExample(mediaType, media.example);
    if (body !== null) examples.push({ name: 'Example', body, source: 'explicit' });
  }
  if (record(media.examples)) {
    for (const [name, rawExample] of Object.entries(media.examples)) {
      const example = resolvedObject(document, rawExample);
      const value = example && Object.hasOwn(example, 'value') ? example.value : rawExample;
      const body = serializeExample(mediaType, value);
      if (body !== null) examples.push({ name, body, source: 'explicit' });
    }
  }
  if (examples.length === 0) {
    const value = schemaExample(document, media.schema);
    const body = serializeExample(mediaType, value);
    if (body !== null) examples.push({ name: 'Generated example', body, source: 'schema' });
  }
  return examples;
}

export function requestBodiesForOperation(
  document: unknown,
  method: string,
  path: string,
): OpenApiRequestBody[] {
  const root = resolvedObject(document, document);
  const paths = root && resolvedObject(document, root.paths);
  const pathItem = paths && resolvedObject(document, paths[path]);
  const operation = pathItem && resolvedObject(document, pathItem[method.toLowerCase()]);
  const requestBody = operation && resolvedObject(document, operation.requestBody);
  const content = requestBody && resolvedObject(document, requestBody.content);
  if (!requestBody || !content) return [];
  return Object.entries(content)
    .sort(([left], [right]) => {
      const score = (mediaType: string) => mediaType === 'application/json' ? 0 : 1;
      return score(left) - score(right) || left.localeCompare(right);
    })
    .map(([mediaType, media]) => ({
      required: requestBody.required === true,
      mediaType,
      examples: examplesForMediaType(document, mediaType, media),
    }));
}
