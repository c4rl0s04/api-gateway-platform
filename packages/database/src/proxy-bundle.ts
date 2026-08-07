import { createHash } from 'node:crypto';
import { dereference, validate } from '@readme/openapi-parser';
import {
  isPolicyType,
  parsePolicyConfig,
  type PolicyConfig,
  type PolicyType,
} from '@api-gateway/shared';
import { parse as parseYaml } from 'yaml';

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;
const BUSINESS_POLICY_TYPES = new Set<PolicyType>([
  'api-key-auth',
  'oauth-access-token',
  'mtls-auth',
  'rate-limit',
]);
const SYSTEM_POLICY_TYPES = new Set<PolicyType>([
  ...BUSINESS_POLICY_TYPES,
  'oauth-token',
  'jwks-endpoint',
]);
const AUTHENTICATION_POLICY_TYPES = new Set<PolicyType>([
  'api-key-auth',
  'oauth-access-token',
  'mtls-auth',
]);

export type HttpMethod = Uppercase<(typeof HTTP_METHODS)[number]>;

export type ProxyBundleErrorCode =
  | 'invalid_openapi'
  | 'invalid_gateway_config'
  | 'unknown_operation'
  | 'policy_not_supported';

export class ProxyBundleError extends Error {
  constructor(
    public readonly code: ProxyBundleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProxyBundleError';
  }
}

export interface CompiledProxyOperation {
  operationId: string;
  method: HttpMethod;
  mode: 'forward' | 'local';
  path: string;
  targetPath: string | null;
  policies: PolicyConfig[];
}

export interface CompiledProxyBundle {
  basePath: string;
  openapiVersion: string;
  openapiSource: string;
  openapiDocument: Record<string, unknown>;
  gatewayConfigSource: string;
  gatewayConfig: Record<string, unknown>;
  contentHash: string;
  operations: CompiledProxyOperation[];
  warnings: string[];
}

export interface OpenApiOperationSummary {
  operationId: string;
  method: HttpMethod;
  path: string;
}

export interface InspectedOpenApi {
  openapiVersion: string;
  title: string | null;
  operations: OpenApiOperationSummary[];
  warnings: string[];
}

export interface CompileProxyBundleInput {
  openapiSource: string;
  gatewayConfigSource: string;
  systemManaged?: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function assertInternalReferences(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertInternalReferences);
    return;
  }
  if (!record(value)) return;
  if (typeof value.$ref === 'string' && !value.$ref.startsWith('#/')) {
    throw new ProxyBundleError(
      'invalid_openapi',
      `External OpenAPI reference is not allowed: ${value.$ref}`,
    );
  }
  Object.values(value).forEach(assertInternalReferences);
}

function parseDocument(source: string, code: ProxyBundleErrorCode): Record<string, unknown> {
  try {
    const value = parseYaml(source);
    if (!record(value)) throw new Error('document root must be an object');
    return value;
  } catch (error) {
    throw new ProxyBundleError(
      code,
      `${code === 'invalid_openapi' ? 'OpenAPI' : 'Gateway configuration'} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function normalizeBasePath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new ProxyBundleError('invalid_gateway_config', 'basePath must start with /');
  }
  if (value.includes('?') || value.includes('#')) {
    throw new ProxyBundleError('invalid_gateway_config', 'basePath cannot contain a query or fragment');
  }
  const normalized = value === '/' ? value : value.replace(/\/+$/, '');
  if (normalized.includes('{') || normalized.includes('}')) {
    throw new ProxyBundleError('invalid_gateway_config', 'basePath cannot contain parameters');
  }
  return normalized;
}

function compilePolicies(
  value: unknown,
  systemManaged: boolean,
): PolicyConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ProxyBundleError('invalid_gateway_config', 'policies must be an array');
  }
  const allowed = systemManaged ? SYSTEM_POLICY_TYPES : BUSINESS_POLICY_TYPES;
  const policies = value.map((candidate, index): PolicyConfig => {
    if (!record(candidate) || typeof candidate.type !== 'string') {
      throw new ProxyBundleError('invalid_gateway_config', `Policy ${index + 1} requires a type`);
    }
    if (!isPolicyType(candidate.type) || !allowed.has(candidate.type)) {
      throw new ProxyBundleError(
        'policy_not_supported',
        `Policy type "${candidate.type}" is not supported for this proxy`,
      );
    }
    if (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean') {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Policy ${candidate.type} enabled must be a boolean`,
      );
    }
    try {
      return {
        type: candidate.type,
        order: index + 1,
        enabled: candidate.enabled ?? true,
        config: parsePolicyConfig(candidate.type, candidate.config),
      } as PolicyConfig;
    } catch (error) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Policy ${candidate.type} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  const authenticationCount = policies.filter(policy =>
    policy.enabled && AUTHENTICATION_POLICY_TYPES.has(policy.type)).length;
  if (authenticationCount > 1) {
    throw new ProxyBundleError(
      'invalid_gateway_config',
      'An operation cannot configure more than one authentication policy',
    );
  }
  return policies;
}

function parameters(path: string): Set<string> {
  return new Set([...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]));
}

function validateTargetPath(path: string, targetPath: string): void {
  if (!targetPath.startsWith('/')) {
    throw new ProxyBundleError('invalid_gateway_config', 'targetPath must start with /');
  }
  const publicParameters = parameters(path);
  for (const targetParameter of parameters(targetPath)) {
    if (!publicParameters.has(targetParameter)) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `targetPath parameter {${targetParameter}} is not declared by ${path}`,
      );
    }
  }
}

interface InspectedOpenApiDocument extends InspectedOpenApi {
  sourceDocument: Record<string, unknown>;
}

async function inspectOpenApiDocument(
  openapiSource: string,
): Promise<InspectedOpenApiDocument> {
  const sourceDocument = parseDocument(openapiSource, 'invalid_openapi');
  const openapiVersion = sourceDocument.openapi;
  if (
    typeof openapiVersion !== 'string'
    || (!openapiVersion.startsWith('3.0.') && !openapiVersion.startsWith('3.1.'))
  ) {
    throw new ProxyBundleError(
      'invalid_openapi',
      'Only OpenAPI 3.0 and 3.1 documents are supported',
    );
  }
  assertInternalReferences(sourceDocument);
  const parserDocument = sourceDocument as unknown as Parameters<typeof validate>[0];
  const validation = await validate(parserDocument, {
    resolve: { external: false, file: false },
  });
  if (!validation.valid) {
    throw new ProxyBundleError(
      'invalid_openapi',
      validation.errors.map(error => error.message).join('\n'),
    );
  }
  const resolved = await dereference(parserDocument, {
    resolve: { external: false, file: false },
    dereference: { circular: 'ignore' },
  }) as Record<string, unknown>;
  const paths = resolved.paths;
  if (!record(paths)) {
    throw new ProxyBundleError('invalid_openapi', 'OpenAPI paths must be an object');
  }
  const operations: OpenApiOperationSummary[] = [];
  const operationIds = new Set<string>();
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!record(pathItem)) continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!record(operation)) continue;
      if (typeof operation.operationId !== 'string' || !operation.operationId.trim()) {
        throw new ProxyBundleError(
          'invalid_openapi',
          `${method.toUpperCase()} ${path} requires operationId`,
        );
      }
      const operationId = operation.operationId.trim();
      if (operationIds.has(operationId)) {
        throw new ProxyBundleError('invalid_openapi', `operationId ${operationId} is duplicated`);
      }
      operationIds.add(operationId);
      operations.push({
        operationId,
        method: method.toUpperCase() as HttpMethod,
        path,
      });
    }
  }
  if (operations.length === 0) {
    throw new ProxyBundleError('invalid_openapi', 'OpenAPI document has no operations');
  }
  const info = record(sourceDocument.info) ? sourceDocument.info : null;
  return {
    sourceDocument,
    openapiVersion,
    title: typeof info?.title === 'string' ? info.title : null,
    operations,
    warnings: sourceDocument.security === undefined
      ? []
      : ['OpenAPI security is informational; gateway policies are authoritative'],
  };
}

export async function inspectOpenApi(
  openapiSource: string,
): Promise<InspectedOpenApi> {
  const { sourceDocument: _sourceDocument, ...inspection } =
    await inspectOpenApiDocument(openapiSource);
  return inspection;
}

export async function compileProxyBundle(
  input: CompileProxyBundleInput,
): Promise<CompiledProxyBundle> {
  const inspection = await inspectOpenApiDocument(input.openapiSource);
  const openapiDocument = inspection.sourceDocument;
  const openapiVersion = inspection.openapiVersion;

  const gateway = parseDocument(input.gatewayConfigSource, 'invalid_gateway_config');
  if (gateway.apiVersion !== 'gateway.platform/v1') {
    throw new ProxyBundleError(
      'invalid_gateway_config',
      'apiVersion must be gateway.platform/v1',
    );
  }
  const basePath = normalizeBasePath(gateway.basePath);
  const defaults = gateway.defaults === undefined ? {} : gateway.defaults;
  if (!record(defaults)) {
    throw new ProxyBundleError('invalid_gateway_config', 'defaults must be an object');
  }
  const defaultPolicies = compilePolicies(defaults.policies, input.systemManaged === true);
  const overrides = gateway.operations === undefined ? {} : gateway.operations;
  if (!record(overrides)) {
    throw new ProxyBundleError('invalid_gateway_config', 'operations must be an object');
  }

  const operations: CompiledProxyOperation[] = [];
  const operationIds = new Set(inspection.operations.map(operation => operation.operationId));
  for (const { operationId, method, path } of inspection.operations) {
    const override = overrides[operationId] === undefined ? {} : overrides[operationId];
    if (!record(override)) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Configuration for ${operationId} must be an object`,
      );
    }
    if (
      override.mode !== undefined
      && override.mode !== 'forward'
      && override.mode !== 'local'
    ) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Operation ${operationId} mode must be forward or local`,
      );
    }
    const mode = input.systemManaged && override.mode === 'local' ? 'local' : 'forward';
    if (!input.systemManaged && override.mode !== undefined) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        'Business proxy operations cannot override forward mode',
      );
    }
    const targetPath = mode === 'local'
      ? null
      : typeof override.targetPath === 'string' ? override.targetPath : path;
    if (targetPath) validateTargetPath(path, targetPath);
    const policies = override.policies === undefined
      ? defaultPolicies
      : compilePolicies(override.policies, input.systemManaged === true);
    const enabledTypes = policies.filter(policy => policy.enabled).map(policy => policy.type);
    if (mode === 'local' && !enabledTypes.some(type =>
      type === 'oauth-token' || type === 'jwks-endpoint')) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Local operation ${operationId} requires a terminal policy`,
      );
    }
    operations.push({
      operationId,
      method,
      mode,
      path,
      targetPath,
      policies,
    });
  }
  for (const operationId of Object.keys(overrides)) {
    if (!operationIds.has(operationId)) {
      throw new ProxyBundleError(
        'unknown_operation',
        `Gateway configuration references unknown operation ${operationId}`,
      );
    }
  }
  const normalizedGateway = {
    apiVersion: 'gateway.platform/v1',
    basePath,
    defaults: { policies: defaultPolicies },
    operations: Object.fromEntries(operations.map(operation => [
      operation.operationId,
      {
        mode: operation.mode,
        targetPath: operation.targetPath,
        policies: operation.policies,
      },
    ])),
  };
  const contentHash = createHash('sha256')
    .update(stableJson(openapiDocument))
    .update('\0')
    .update(stableJson(normalizedGateway))
    .digest('hex');

  return {
    basePath,
    openapiVersion,
    openapiSource: input.openapiSource,
    openapiDocument,
    gatewayConfigSource: input.gatewayConfigSource,
    gatewayConfig: normalizedGateway,
    contentHash,
    operations,
    warnings: inspection.warnings,
  };
}
