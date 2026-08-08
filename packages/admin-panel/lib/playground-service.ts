import type {
  ApiProxyDetail,
  ProxyDeployment,
  ProxyRevisionDetail,
} from '@/lib/api-client';
import {
  assertAuthenticationCompatible,
  authenticationRequirement,
  buildPlaygroundCurl,
  buildPlaygroundTarget,
  operationSupportsBody,
  PlaygroundValidationError,
  redactHeaders,
  safeRequestHeaders,
  type PlaygroundExecutionInput,
} from '@/lib/playground';

export interface PlaygroundGatewayRequest {
  method: string;
  target: URL;
  headers: Record<string, string>;
  body?: string;
}

export interface PlaygroundGatewayResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  truncated: boolean;
}

export interface PlaygroundCatalog {
  getProxy(proxyId: string): Promise<ApiProxyDetail>;
  listDeployments(proxyId: string): Promise<ProxyDeployment[]>;
  getRevision(proxyId: string, revisionNumber: number): Promise<ProxyRevisionDetail>;
}

export interface PlaygroundTransport {
  send(request: PlaygroundGatewayRequest): Promise<PlaygroundGatewayResponse>;
}

export interface PlaygroundExecutionResult {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    curl: string;
  };
  response: PlaygroundGatewayResponse;
  tokenExchange?: {
    status: number;
    durationMs: number;
  };
}

function formBody(values: Record<string, string>): string {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value) body.set(name, value);
  }
  return body.toString();
}

async function exchangeAccessToken(
  input: PlaygroundExecutionInput,
  publicOrigin: string,
  transport: PlaygroundTransport,
): Promise<{ token: string; status: number; durationMs: number }> {
  if (!['clientCredentials', 'jwtBearer'].includes(input.authentication.type)) {
    throw new PlaygroundValidationError(
      'playground_authentication_mismatch',
      'OAuth token exchange authentication is invalid',
      422,
    );
  }
  const clientCredentials = input.authentication.type === 'clientCredentials';
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (clientCredentials) {
    headers.authorization = `Basic ${Buffer.from(
      `${input.authentication.consumerKey}:${input.authentication.consumerSecret}`,
      'utf8',
    ).toString('base64')}`;
  }
  const body = clientCredentials
    ? formBody({
        grant_type: 'client_credentials',
        scope: input.authentication.scope,
      })
    : formBody({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: input.authentication.assertion,
        scope: input.authentication.scope,
      });
  const response = await transport.send({
    method: 'POST',
    target: new URL('/oauth/token', publicOrigin),
    headers,
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new PlaygroundValidationError(
      'playground_token_exchange_failed',
      `OAuth token endpoint returned ${response.status}`,
      502,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new PlaygroundValidationError(
      'playground_token_exchange_failed',
      'OAuth token endpoint returned an invalid JSON response',
      502,
    );
  }
  const token = typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>).access_token
    : undefined;
  if (typeof token !== 'string' || !token) {
    throw new PlaygroundValidationError(
      'playground_token_exchange_failed',
      'OAuth token endpoint did not return an access token',
      502,
    );
  }
  return { token, status: response.status, durationMs: response.durationMs };
}

export async function executePlaygroundRequest(
  input: PlaygroundExecutionInput,
  catalog: PlaygroundCatalog,
  transport: PlaygroundTransport,
): Promise<PlaygroundExecutionResult> {
  const [proxy, deployments] = await Promise.all([
    catalog.getProxy(input.proxyId),
    catalog.listDeployments(input.proxyId),
  ]);
  if (!proxy.active || proxy.systemManaged) {
    throw new PlaygroundValidationError(
      'playground_proxy_not_available',
      'Only active business proxies can be executed from the playground',
      409,
    );
  }
  const deployment = deployments.find(candidate => candidate.id === input.deploymentId);
  if (!deployment || deployment.status !== 'active') {
    throw new PlaygroundValidationError(
      'playground_deployment_not_active',
      'Selected deployment is not active',
      409,
    );
  }
  const revision = await catalog.getRevision(
    proxy.id,
    deployment.revision.revisionNumber,
  );
  const operation = revision.operations.find(
    candidate => candidate.operationId === input.operationId,
  );
  if (!operation) {
    throw new PlaygroundValidationError(
      'playground_operation_not_found',
      'Selected operation does not belong to the active revision',
      404,
    );
  }
  const requirement = authenticationRequirement(operation.policies);
  assertAuthenticationCompatible(requirement, input.authentication);

  const target = buildPlaygroundTarget(
    deployment.environment.publicOrigin,
    revision.basePath,
    operation.path,
    input.pathParameters,
    input.queryParameters,
  );
  const headers = safeRequestHeaders(input.headers);
  headers.accept ??= 'application/json';
  if (input.body && operationSupportsBody(operation)) {
    headers['content-type'] ??= 'application/json';
  }

  let tokenExchange: PlaygroundExecutionResult['tokenExchange'];
  if (requirement.type === 'apiKey' && input.authentication.type === 'apiKey') {
    headers[requirement.header.toLowerCase()] = input.authentication.value;
  } else if (input.authentication.type === 'bearerToken') {
    headers.authorization = `Bearer ${input.authentication.token}`;
  } else if (
    input.authentication.type === 'clientCredentials'
    || input.authentication.type === 'jwtBearer'
  ) {
    const exchange = await exchangeAccessToken(
      input,
      deployment.environment.publicOrigin,
      transport,
    );
    headers.authorization = `Bearer ${exchange.token}`;
    tokenExchange = { status: exchange.status, durationMs: exchange.durationMs };
  }

  const method = operation.method.toUpperCase();
  const body = operationSupportsBody(operation) ? input.body : undefined;
  const response = await transport.send({ method, target, headers, body });
  const redacted = redactHeaders(headers);
  if (requirement.type === 'apiKey') {
    redacted[requirement.header.toLowerCase()] = '<redacted>';
  }
  return {
    request: {
      method,
      url: target.toString(),
      headers: redacted,
      ...(body ? { body } : {}),
      curl: buildPlaygroundCurl({ method, url: target.toString(), headers: redacted, body }),
    },
    response,
    ...(tokenExchange ? { tokenExchange } : {}),
  };
}
