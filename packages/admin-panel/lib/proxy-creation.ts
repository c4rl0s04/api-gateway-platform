import { parse, stringify } from 'yaml';

export const MAX_PROXY_SOURCE_BYTES = 5 * 1024 * 1024;

export const BUSINESS_POLICY_TYPES = [
  'api-key-auth',
  'oauth-access-token',
  'mtls-auth',
  'rate-limit',
] as const;

export type BusinessPolicyType = (typeof BUSINESS_POLICY_TYPES)[number];
export type PolicyFailureMode = 'open' | 'closed';

export interface EditablePolicy {
  id: string;
  type: BusinessPolicyType;
  enabled: boolean;
  failureMode: PolicyFailureMode;
  header?: string;
  audience?: string;
  requiredScopes?: string[];
  limit?: number;
  windowSeconds?: number;
}

export interface OpenApiOperationDraft {
  operationId: string;
  method: string;
  path: string;
  targetPath: string;
  inheritPolicies: boolean;
  policies: EditablePolicy[];
}

export interface ProxyCreationDraft {
  organizationId: string;
  name: string;
  openapiSource: string;
  openapiSourceName: string;
  openapiVersion: string;
  openapiTitle: string | null;
  warnings: string[];
  basePath: string;
  defaultPolicies: EditablePolicy[];
  operations: OpenApiOperationDraft[];
}

export interface OpenApiOperationInspection {
  operationId: string;
  method: string;
  path: string;
}

export interface OpenApiInspection {
  openapiVersion: string;
  title: string | null;
  operations: OpenApiOperationInspection[];
  warnings: string[];
}

export interface CompiledProxyConfiguration {
  basePath: string;
  gatewayConfig: Record<string, unknown>;
  contentHash: string;
  operations: Array<OpenApiOperationInspection & {
    targetPath: string | null;
    policies: Array<{
      type: string;
      order: number;
      enabled: boolean;
      config: Record<string, unknown>;
    }>;
  }>;
  warnings: string[];
}

export interface ProxyConfigurationValidation {
  openapi: OpenApiInspection;
  compiled: CompiledProxyConfiguration | null;
}

export interface ConfiguredProxyResult {
  proxy: { id: string; name: string; organizationId: string };
  revision: { revisionNumber: number; contentHash: string; warnings?: string[] };
}

export interface DraftValidation {
  valid: boolean;
  errors: string[];
}

export type ProxyCreationDraftAction =
  | { type: 'set-identity'; organizationId?: string; name?: string }
  | { type: 'set-openapi-source'; source: string; filename: string }
  | { type: 'apply-openapi-inspection'; inspection: OpenApiInspection }
  | { type: 'hydrate-gateway-source'; source: string }
  | { type: 'set-base-path'; basePath: string }
  | { type: 'set-default-policies'; policies: EditablePolicy[] }
  | { type: 'set-operation'; operation: OpenApiOperationDraft };

const AUTHENTICATION_POLICIES = new Set<BusinessPolicyType>([
  'api-key-auth',
  'oauth-access-token',
  'mtls-auth',
]);
const PATH_PARAMETER = /\{([A-Za-z0-9_]+)\}/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function createEditablePolicy(
  type: BusinessPolicyType,
  id: string,
): EditablePolicy {
  switch (type) {
    case 'api-key-auth':
      return { id, type, enabled: true, failureMode: 'closed', header: 'x-api-key' };
    case 'oauth-access-token':
      return {
        id,
        type,
        enabled: true,
        failureMode: 'closed',
        audience: '',
        requiredScopes: [],
      };
    case 'rate-limit':
      return {
        id,
        type,
        enabled: true,
        failureMode: 'closed',
        limit: 100,
        windowSeconds: 60,
      };
    case 'mtls-auth':
      return { id, type, enabled: true, failureMode: 'closed' };
  }
}

export function editablePolicyFromUnknown(
  value: unknown,
  id: string,
): EditablePolicy | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (!BUSINESS_POLICY_TYPES.includes(value.type as BusinessPolicyType)) return null;
  const type = value.type as BusinessPolicyType;
  const config = isRecord(value.config) ? value.config : {};
  const policy = createEditablePolicy(type, id);
  policy.enabled = value.enabled === undefined ? true : value.enabled === true;
  policy.failureMode = config.failureMode === 'open' ? 'open' : 'closed';
  if (type === 'api-key-auth' && typeof config.header === 'string') {
    policy.header = config.header;
  }
  if (type === 'oauth-access-token') {
    policy.audience = typeof config.audience === 'string' ? config.audience : '';
    policy.requiredScopes = stringArray(config.requiredScopes);
  }
  if (type === 'rate-limit') {
    policy.limit = typeof config.limit === 'number' ? config.limit : 100;
    policy.windowSeconds = typeof config.windowSeconds === 'number'
      ? config.windowSeconds
      : 60;
  }
  return policy;
}

function policiesFromUnknown(value: unknown, keyPrefix: string): EditablePolicy[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((policy, index) => {
    const editable = editablePolicyFromUnknown(policy, `${keyPrefix}-${index}`);
    return editable ? [editable] : [];
  });
}

export function applyOpenApiInspection(
  draft: ProxyCreationDraft,
  inspection: OpenApiInspection,
): ProxyCreationDraft {
  const currentById = new Map(draft.operations.map(operation => [operation.operationId, operation]));
  return {
    ...draft,
    openapiVersion: inspection.openapiVersion,
    openapiTitle: inspection.title,
    warnings: inspection.warnings,
    operations: inspection.operations.map(operation => {
      const current = currentById.get(operation.operationId);
      return {
        ...operation,
        targetPath: current?.targetPath ?? operation.path,
        inheritPolicies: current?.inheritPolicies ?? true,
        policies: current?.policies ?? [],
      };
    }),
  };
}

export function proxyCreationDraftReducer(
  draft: ProxyCreationDraft,
  action: ProxyCreationDraftAction,
): ProxyCreationDraft {
  switch (action.type) {
    case 'set-identity':
      return {
        ...draft,
        organizationId: action.organizationId ?? draft.organizationId,
        name: action.name ?? draft.name,
      };
    case 'set-openapi-source':
      return {
        ...draft,
        openapiSource: action.source,
        openapiSourceName: action.filename,
        openapiVersion: '',
        openapiTitle: null,
        warnings: [],
        operations: [],
      };
    case 'apply-openapi-inspection':
      return applyOpenApiInspection(draft, action.inspection);
    case 'hydrate-gateway-source':
      return hydrateGatewaySource(draft, action.source);
    case 'set-base-path':
      return { ...draft, basePath: action.basePath };
    case 'set-default-policies':
      return { ...draft, defaultPolicies: action.policies };
    case 'set-operation':
      return {
        ...draft,
        operations: draft.operations.map(operation =>
          operation.operationId === action.operation.operationId ? action.operation : operation),
      };
  }
}

export function hydrateGatewaySource(
  draft: ProxyCreationDraft,
  source: string,
): ProxyCreationDraft {
  const document = parse(source) as unknown;
  if (!isRecord(document)) throw new Error('Gateway configuration root must be an object');
  const defaults = isRecord(document.defaults) ? document.defaults : {};
  const overrides = isRecord(document.operations) ? document.operations : {};
  return {
    ...draft,
    basePath: typeof document.basePath === 'string' ? document.basePath : '',
    defaultPolicies: policiesFromUnknown(defaults.policies, 'default'),
    operations: draft.operations.map(operation => {
      const override = isRecord(overrides[operation.operationId])
        ? overrides[operation.operationId] as Record<string, unknown>
        : {};
      const hasPolicyOverride = Array.isArray(override.policies);
      return {
        ...operation,
        targetPath: typeof override.targetPath === 'string'
          ? override.targetPath
          : operation.path,
        inheritPolicies: !hasPolicyOverride,
        policies: hasPolicyOverride
          ? policiesFromUnknown(override.policies, operation.operationId)
          : [],
      };
    }),
  };
}

function serializePolicy(policy: EditablePolicy) {
  const config: Record<string, unknown> = { failureMode: policy.failureMode };
  if (policy.type === 'api-key-auth') config.header = policy.header?.trim() || 'x-api-key';
  if (policy.type === 'oauth-access-token') {
    config.audience = policy.audience?.trim() ?? '';
    config.requiredScopes = policy.requiredScopes ?? [];
  }
  if (policy.type === 'rate-limit') {
    config.limit = policy.limit;
    config.windowSeconds = policy.windowSeconds;
  }
  return { type: policy.type, enabled: policy.enabled, config };
}

export function gatewayDocument(draft: ProxyCreationDraft) {
  return {
    apiVersion: 'gateway.platform/v1',
    basePath: draft.basePath.trim(),
    defaults: { policies: draft.defaultPolicies.map(serializePolicy) },
    operations: Object.fromEntries(draft.operations.map(operation => [
      operation.operationId,
      {
        targetPath: operation.targetPath.trim(),
        ...(operation.inheritPolicies
          ? {}
          : { policies: operation.policies.map(serializePolicy) }),
      },
    ])),
  };
}

export function serializeGatewayConfiguration(draft: ProxyCreationDraft): string {
  return stringify(gatewayDocument(draft), { lineWidth: 0 });
}

export function validatePolicies(policies: EditablePolicy[]): DraftValidation {
  const errors: string[] = [];
  const authenticationCount = policies.filter(policy =>
    policy.enabled && AUTHENTICATION_POLICIES.has(policy.type)).length;
  if (authenticationCount > 1) {
    errors.push('Only one enabled authentication policy is allowed.');
  }
  for (const policy of policies) {
    if (policy.type === 'api-key-auth' && !policy.header?.trim()) {
      errors.push('API-key authentication requires a header name.');
    }
    if (policy.type === 'oauth-access-token' && !policy.audience?.trim()) {
      errors.push('OAuth access-token validation requires an audience.');
    }
    if (policy.type === 'rate-limit') {
      if (!Number.isInteger(policy.limit) || (policy.limit ?? 0) <= 0) {
        errors.push('Rate limit must be a positive whole number.');
      }
      if (!Number.isInteger(policy.windowSeconds) || (policy.windowSeconds ?? 0) <= 0) {
        errors.push('Rate-limit window must be a positive whole number.');
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateTargetPath(path: string, targetPath: string): DraftValidation {
  const errors: string[] = [];
  if (!targetPath.startsWith('/')) errors.push('Target path must start with /.');
  const publicParameters = new Set([...path.matchAll(PATH_PARAMETER)].map(match => match[1]));
  for (const match of targetPath.matchAll(PATH_PARAMETER)) {
    if (!publicParameters.has(match[1])) {
      errors.push(`Target parameter {${match[1]}} is not declared by ${path}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateRoutingDraft(draft: ProxyCreationDraft): DraftValidation {
  const errors: string[] = [];
  const basePath = draft.basePath.trim();
  if (!basePath.startsWith('/')) errors.push('Base path must start with /.');
  if (basePath.includes('?') || basePath.includes('#')) {
    errors.push('Base path cannot contain a query or fragment.');
  }
  if (basePath.includes('{') || basePath.includes('}')) {
    errors.push('Base path cannot contain parameters.');
  }
  errors.push(...validatePolicies(draft.defaultPolicies).errors);
  for (const operation of draft.operations) {
    errors.push(...validateTargetPath(operation.path, operation.targetPath).errors.map(
      error => `${operation.operationId}: ${error}`,
    ));
    if (!operation.inheritPolicies) {
      errors.push(...validatePolicies(operation.policies).errors.map(
        error => `${operation.operationId}: ${error}`,
      ));
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateProxyCreationStep(
  draft: ProxyCreationDraft,
  step: 0 | 1 | 2 | 3,
): DraftValidation {
  if (step === 0) {
    const validName = draft.name.trim().length > 0 && draft.name.trim().length <= 120;
    return {
      valid: Boolean(draft.organizationId && validName),
      errors: [
        ...(!draft.organizationId ? ['Select an organization.'] : []),
        ...(!validName ? ['Provide a proxy name between 1 and 120 characters.'] : []),
      ],
    };
  }
  if (step === 1) {
    const errors = [
      ...(!draft.openapiSource.trim() ? ['Provide an OpenAPI document.'] : []),
      ...(sourceByteLength(draft.openapiSource) > MAX_PROXY_SOURCE_BYTES
        ? ['The OpenAPI source exceeds the 5 MiB limit.']
        : []),
    ];
    return { valid: errors.length === 0, errors };
  }
  const routing = validateRoutingDraft(draft);
  const errors = [
    ...(draft.operations.length === 0 ? ['The OpenAPI document has no supported operations.'] : []),
    ...routing.errors,
  ];
  return { valid: errors.length === 0, errors };
}

export function sourceByteLength(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}

export function emptyProxyCreationDraft(): ProxyCreationDraft {
  return {
    organizationId: '',
    name: '',
    openapiSource: '',
    openapiSourceName: '',
    openapiVersion: '',
    openapiTitle: null,
    warnings: [],
    basePath: '',
    defaultPolicies: [],
    operations: [],
  };
}
