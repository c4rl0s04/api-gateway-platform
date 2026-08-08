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
  validatePlaygroundTarget,
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

function oauthTokenRequest(
  authentication: PlaygroundExecutionInput['authentication'],
  target: URL,
): PlaygroundGatewayRequest {
  if (authentication.type !== 'clientCredentials' && authentication.type !== 'jwtBearer') {
    throw new PlaygroundValidationError(
      'playground_authentication_mismatch',
      'OAuth token authentication is invalid',
      422,
    );
  }
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (authentication.type === 'clientCredentials') {
    headers.authorization = `Basic ${Buffer.from(
      `${authentication.consumerKey}:${authentication.consumerSecret}`,
      'utf8',
    ).toString('base64')}`;
  }
  return {
    method: 'POST',
    target,
    headers,
    body: authentication.type === 'clientCredentials'
      ? formBody({ grant_type: 'client_credentials', scope: authentication.scope })
      : formBody({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: authentication.assertion,
          scope: authentication.scope,
        }),
  };
}

async function exchangeAccessToken(
  input: PlaygroundExecutionInput,
  publicOrigin: string,
  transport: PlaygroundTransport,
): Promise<{ token: string; status: number; durationMs: number }> {
  const authentication = input.authentication;
  if (authentication.type !== 'clientCredentials' && authentication.type !== 'jwtBearer') {
    throw new PlaygroundValidationError(
      'playground_authentication_mismatch',
      'OAuth token exchange authentication is invalid',
      422,
    );
  }
  const response = await transport.send(oauthTokenRequest(
    authentication,
    new URL('/oauth/token', publicOrigin),
  ));
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
  if (!proxy.active) {
    throw new PlaygroundValidationError(
      'playground_proxy_not_available',
      'Only active proxies can be executed from the playground',
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
  const allowedManagedOperation = proxy.id === 'proxy-platform-oauth'
    && operation.mode === 'local'
    && (requirement.type === 'oauthToken' || requirement.type === 'jwks');
  if (proxy.systemManaged && !allowedManagedOperation) {
    throw new PlaygroundValidationError(
      'playground_proxy_not_available',
      'This managed proxy operation is not available in the playground',
      409,
    );
  }
  assertAuthenticationCompatible(requirement, input.authentication);

  const target = input.targetUrl
    ? validatePlaygroundTarget(
        input.targetUrl,
        deployment.environment.publicOrigin,
        revision.basePath,
        operation.path,
      )
    : buildPlaygroundTarget(
        deployment.environment.publicOrigin,
        revision.basePath,
        operation.path,
        input.pathParameters,
        input.queryParameters,
      );
  const headers = safeRequestHeaders(input.headers);
  headers.accept ??= 'application/json';
  if (input.body && operationSupportsBody(operation)) {
    headers['content-type'] ??= input.bodyMediaType || 'application/json';
  }

  if (requirement.type === 'oauthToken') {
    const tokenRequest = oauthTokenRequest(input.authentication, target);
    const response = await transport.send(tokenRequest);
    const redacted = redactHeaders(tokenRequest.headers);
    return {
      request: {
        method: tokenRequest.method,
        url: target.toString(),
        headers: redacted,
        body: tokenRequest.body,
        curl: buildPlaygroundCurl({
          method: tokenRequest.method,
          url: target.toString(),
          headers: redacted,
          body: tokenRequest.body,
        }),
      },
      response,
    };
  }

  let tokenExchange: PlaygroundExecutionResult['tokenExchange'];
  if (requirement.type === 'apiKey' && input.authentication.type === 'apiKey') {
    headers[requirement.header.toLowerCase()] = input.authentication.value;
  } else if (input.authentication.type === 'bearerToken') {
    headers.authorization = `Bearer ${input.authentication.token}`;
  } else if (requirement.type === 'oauth' && (
    input.authentication.type === 'clientCredentials'
    || input.authentication.type === 'jwtBearer'
  )) {
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
