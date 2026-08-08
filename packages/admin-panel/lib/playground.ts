import type { OperationPolicy, ProxyOperation } from '@/lib/api-client';

export const PLAYGROUND_MAX_BODY_BYTES = 256 * 1024;
export const PLAYGROUND_MAX_RESPONSE_BYTES = 1024 * 1024;
export const PLAYGROUND_MAX_PARAMETERS = 20;

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const blockedHeaders = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export type PlaygroundAuthentication =
  | { type: 'none' }
  | { type: 'apiKey'; value: string }
  | { type: 'bearerToken'; token: string }
  | {
      type: 'clientCredentials';
      consumerKey: string;
      consumerSecret: string;
      scope: string;
    }
  | { type: 'jwtBearer'; assertion: string; scope: string };

export interface PlaygroundParameter {
  name: string;
  value: string;
}

export interface PlaygroundExecutionInput {
  proxyId: string;
  deploymentId: string;
  operationId: string;
  pathParameters: Record<string, string>;
  queryParameters: PlaygroundParameter[];
  headers: PlaygroundParameter[];
  body?: string;
  authentication: PlaygroundAuthentication;
}

export type PlaygroundAuthenticationRequirement =
  | { type: 'none' }
  | { type: 'apiKey'; header: string }
  | { type: 'oauth'; requiredScopes: string[] }
  | { type: 'mtls' }
  | { type: 'unsupported'; policyType: string };

export class PlaygroundValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'PlaygroundValidationError';
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(
  value: unknown,
  field: string,
  maxLength = 4096,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new PlaygroundValidationError(
      'invalid_playground_request',
      `${field} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, maxLength: number): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new PlaygroundValidationError(
      'invalid_playground_request',
      `${field} must contain at most ${maxLength} characters`,
    );
  }
  return value;
}

function parameters(value: unknown, field: string): PlaygroundParameter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PLAYGROUND_MAX_PARAMETERS) {
    throw new PlaygroundValidationError(
      'invalid_playground_request',
      `${field} must contain at most ${PLAYGROUND_MAX_PARAMETERS} entries`,
    );
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const candidate = objectValue(entry);
    const name = requiredString(candidate?.name, `${field}[${index}].name`, 120);
    const normalizedName = name.toLowerCase();
    if (!headerNamePattern.test(name)) {
      throw new PlaygroundValidationError(
        'invalid_playground_request',
        `${field}[${index}].name contains unsupported characters`,
      );
    }
    if (seen.has(normalizedName)) {
      throw new PlaygroundValidationError(
        'invalid_playground_request',
        `${field} cannot contain duplicate names`,
      );
    }
    seen.add(normalizedName);
    return {
      name,
      value: optionalString(candidate?.value, `${field}[${index}].value`, 4096),
    };
  });
}

function authentication(value: unknown): PlaygroundAuthentication {
  const candidate = objectValue(value);
  const type = candidate?.type;
  if (type === 'none') return { type };
  if (type === 'apiKey') {
    return { type, value: requiredString(candidate.value, 'authentication.value') };
  }
  if (type === 'bearerToken') {
    return { type, token: requiredString(candidate.token, 'authentication.token', 16_384) };
  }
  if (type === 'clientCredentials') {
    return {
      type,
      consumerKey: requiredString(candidate.consumerKey, 'authentication.consumerKey', 120),
      consumerSecret: requiredString(candidate.consumerSecret, 'authentication.consumerSecret', 4096),
      scope: optionalString(candidate.scope, 'authentication.scope', 2048).trim(),
    };
  }
  if (type === 'jwtBearer') {
    return {
      type,
      assertion: requiredString(candidate.assertion, 'authentication.assertion', 16_384),
      scope: optionalString(candidate.scope, 'authentication.scope', 2048).trim(),
    };
  }
  throw new PlaygroundValidationError(
    'invalid_playground_request',
    'authentication.type is not supported',
  );
}

export function parsePlaygroundExecutionInput(value: unknown): PlaygroundExecutionInput {
  const candidate = objectValue(value);
  if (!candidate) {
    throw new PlaygroundValidationError(
      'invalid_playground_request',
      'Playground request body must be an object',
    );
  }
  const rawPathParameters = candidate.pathParameters === undefined
    ? {}
    : objectValue(candidate.pathParameters);
  if (!rawPathParameters) {
    throw new PlaygroundValidationError(
      'invalid_playground_request',
      'pathParameters must be an object',
    );
  }
  const pathParameters = Object.fromEntries(
    Object.entries(rawPathParameters).map(([name, rawValue]) => [
      name,
      optionalString(rawValue, `pathParameters.${name}`, 2048),
    ]),
  );
  const body = optionalString(candidate.body, 'body', PLAYGROUND_MAX_BODY_BYTES);
  if (Buffer.byteLength(body, 'utf8') > PLAYGROUND_MAX_BODY_BYTES) {
    throw new PlaygroundValidationError(
      'playground_body_too_large',
      `Request body cannot exceed ${PLAYGROUND_MAX_BODY_BYTES} bytes`,
      413,
    );
  }
  return {
    proxyId: requiredString(candidate.proxyId, 'proxyId', 120),
    deploymentId: requiredString(candidate.deploymentId, 'deploymentId', 120),
    operationId: requiredString(candidate.operationId, 'operationId', 160),
    pathParameters,
    queryParameters: parameters(candidate.queryParameters, 'queryParameters'),
    headers: parameters(candidate.headers, 'headers'),
    ...(body ? { body } : {}),
    authentication: authentication(candidate.authentication),
  };
}

export function authenticationRequirement(
  policies: OperationPolicy[],
): PlaygroundAuthenticationRequirement {
  const authenticationPolicy = policies
    .filter(policy => policy.enabled)
    .find(policy => ['api-key-auth', 'oauth-access-token', 'mtls-auth'].includes(policy.type));
  if (!authenticationPolicy) {
    const unsupported = policies
      .filter(policy => policy.enabled)
      .find(policy => ['oauth-token', 'jwks-endpoint'].includes(policy.type));
    return unsupported
      ? { type: 'unsupported', policyType: unsupported.type }
      : { type: 'none' };
  }
  if (authenticationPolicy.type === 'api-key-auth') {
    return {
      type: 'apiKey',
      header: typeof authenticationPolicy.config.header === 'string'
        ? authenticationPolicy.config.header
        : 'x-api-key',
    };
  }
  if (authenticationPolicy.type === 'oauth-access-token') {
    return {
      type: 'oauth',
      requiredScopes: Array.isArray(authenticationPolicy.config.requiredScopes)
        ? authenticationPolicy.config.requiredScopes.filter(
            (scope): scope is string => typeof scope === 'string',
          )
        : [],
    };
  }
  return { type: 'mtls' };
}

export function assertAuthenticationCompatible(
  requirement: PlaygroundAuthenticationRequirement,
  authenticationValue: PlaygroundAuthentication,
): void {
  const valid = requirement.type === 'none'
    ? authenticationValue.type === 'none'
    : requirement.type === 'apiKey'
      ? authenticationValue.type === 'apiKey'
      : requirement.type === 'oauth'
        ? ['bearerToken', 'clientCredentials', 'jwtBearer'].includes(authenticationValue.type)
        : false;
  if (!valid) {
    throw new PlaygroundValidationError(
      requirement.type === 'mtls'
        ? 'playground_mtls_requires_local_client'
        : 'playground_authentication_mismatch',
      requirement.type === 'mtls'
        ? 'mTLS operations must be called by a client that owns the private key'
        : 'Selected authentication does not satisfy the operation policy',
      422,
    );
  }
}

export function buildPlaygroundTarget(
  publicOrigin: string,
  basePath: string,
  operationPath: string,
  pathParameters: Record<string, string>,
  queryParameters: PlaygroundParameter[],
): URL {
  const expectedNames = [...operationPath.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
  for (const name of expectedNames) {
    if (!pathParameters[name]) {
      throw new PlaygroundValidationError(
        'missing_path_parameter',
        `Path parameter ${name} is required`,
      );
    }
  }
  const resolvedOperationPath = operationPath.replace(
    /\{([^}]+)\}/g,
    (_placeholder, name: string) => encodeURIComponent(pathParameters[name]),
  );
  const pathname = `${basePath.replace(/\/$/, '')}/${resolvedOperationPath.replace(/^\//, '')}`;
  const target = new URL(pathname, publicOrigin);
  for (const parameter of queryParameters) {
    target.searchParams.append(parameter.name, parameter.value);
  }
  return target;
}

export function safeRequestHeaders(
  input: PlaygroundParameter[],
): Record<string, string> {
  return Object.fromEntries(input.map(({ name, value }) => {
    const normalized = name.toLowerCase();
    if (
      blockedHeaders.has(normalized)
      || normalized.startsWith('x-forwarded-')
      || normalized.startsWith('x-gateway-')
    ) {
      throw new PlaygroundValidationError(
        'playground_header_not_allowed',
        `Header ${name} is controlled by the platform`,
      );
    }
    if (/\r|\n/.test(value)) {
      throw new PlaygroundValidationError(
        'invalid_playground_request',
        `Header ${name} contains a line break`,
      );
    }
    return [normalized, value];
  }));
}

export function operationSupportsBody(operation: Pick<ProxyOperation, 'method'>): boolean {
  return ['post', 'put', 'patch', 'delete'].includes(operation.method.toLowerCase());
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    ['authorization', 'proxy-authorization'].includes(name.toLowerCase())
      || name.toLowerCase().includes('api-key')
      || name.toLowerCase().includes('apikey')
      ? '<redacted>'
      : value,
  ]));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildPlaygroundCurl(input: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}): string {
  const parts = ['curl', '--request', input.method.toUpperCase(), shellQuote(input.url)];
  for (const [name, value] of Object.entries(redactHeaders(input.headers))) {
    parts.push('--header', shellQuote(`${name}: ${value}`));
  }
  if (input.body) parts.push('--data', shellQuote(input.body));
  return parts.join(' \\\n+  ');
}
