import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ApiProxyDetail,
  ProxyDeployment,
  ProxyRevisionDetail,
} from '../lib/api-client.js';
import {
  authenticationRequirement,
  buildPlaygroundCurl,
  buildPlaygroundTarget,
  parsePlaygroundExecutionInput,
  parsePlaygroundTarget,
  PlaygroundValidationError,
  safeRequestHeaders,
  validatePlaygroundTarget,
} from '../lib/playground.js';
import {
  executePlaygroundRequest,
  type PlaygroundCatalog,
  type PlaygroundGatewayRequest,
  type PlaygroundGatewayResponse,
} from '../lib/playground-service.js';
import {
  executePlayground as executePlaygroundApi,
  PlaygroundApiError,
} from '../lib/playground-api.js';

const proxy = {
  id: 'proxy-banking',
  name: 'Banking',
  active: true,
  systemManaged: false,
  organizationId: 'org-bank',
  products: [],
} as unknown as ApiProxyDetail;

const deployment = {
  id: 'deployment-qual-es',
  proxyId: proxy.id,
  revisionId: 'revision-2',
  environmentId: 'env-qual-es',
  status: 'active',
  revision: {
    revisionNumber: 2,
    basePath: '/es/banking/v1',
    contentHash: 'hash',
  },
  environment: {
    id: 'env-qual-es',
    stage: 'qual',
    region: 'es',
    publicOrigin: 'https://qual-es.gateway.localhost:8443',
  },
} as ProxyDeployment;

function revision(policyType = 'api-key-auth'): ProxyRevisionDetail {
  return {
    id: 'revision-2',
    proxyId: proxy.id,
    revisionNumber: 2,
    basePath: '/es/banking/v1',
    openapiVersion: '3.1.0',
    contentHash: 'hash',
    createdAt: new Date().toISOString(),
    operations: [{
      id: 'operation-account',
      operationId: 'getAccount',
      method: 'get',
      mode: 'forward',
      path: '/accounts/{id}',
      targetPath: '/accounts/{id}',
      requestBodies: [],
      policies: policyType ? [{
        id: 'policy-auth',
        type: policyType,
        enabled: true,
        order: 0,
        config: policyType === 'api-key-auth'
          ? { header: 'x-partner-key' }
          : policyType === 'oauth-access-token'
            ? { requiredScopes: ['banking:read'] }
            : {},
      }] : [],
    }],
  };
}

function catalog(policyType = 'api-key-auth'): PlaygroundCatalog {
  return {
    async getProxy() { return proxy; },
    async listDeployments() { return [deployment]; },
    async getRevision() { return revision(policyType); },
  };
}

function response(overrides: Partial<PlaygroundGatewayResponse> = {}): PlaygroundGatewayResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
    durationMs: 12,
    truncated: false,
    ...overrides,
  };
}

describe('playground request validation', () => {
  it('builds a fixed target from the selected operation and parameters', () => {
    const target = buildPlaygroundTarget(
      'https://qual-es.gateway.localhost:8443',
      '/es/banking/v1',
      '/accounts/{id}',
      { id: 'customer/account 1' },
      [{ name: 'expand', value: 'owner' }],
    );
    assert.equal(
      target.toString(),
      'https://qual-es.gateway.localhost:8443/es/banking/v1/accounts/customer%2Faccount%201?expand=owner',
    );
  });

  it('builds a clean local cURL command with the development CA', () => {
    const command = buildPlaygroundCurl({
      method: 'get',
      url: 'https://qual-kr.gateway.localhost:8443/kr/gaming/v1/leaderboards',
      headers: { accept: 'application/json', 'x-api-key': 'secret-key' },
    });
    assert.match(command, /--cacert '.local-secrets\/pki\/authorities\/local-development\/ca\.crt'/);
    assert.match(command, /x-api-key: <redacted>/);
    assert.doesNotMatch(command, /\n\+/);
    assert.doesNotMatch(command, /secret-key/);
  });

  it('rejects platform-controlled and injected headers', () => {
    assert.throws(
      () => safeRequestHeaders([{ name: 'host', value: 'evil.example' }]),
      (error: unknown) => error instanceof PlaygroundValidationError
        && error.code === 'playground_header_not_allowed',
    );
    assert.throws(
      () => safeRequestHeaders([{ name: 'x-test', value: 'ok\r\ninjected: yes' }]),
      PlaygroundValidationError,
    );
  });

  it('parses a bounded request and rejects unknown authentication modes', () => {
    const parsed = parsePlaygroundExecutionInput({
      proxyId: ' proxy-banking ',
      deploymentId: 'deployment-qual-es',
      operationId: 'getAccount',
      pathParameters: { id: '42' },
      queryParameters: [],
      headers: [],
      authentication: { type: 'apiKey', value: 'secret-key' },
    });
    assert.equal(parsed.proxyId, 'proxy-banking');
    assert.throws(
      () => parsePlaygroundExecutionInput({
        proxyId: 'proxy-banking',
        deploymentId: 'deployment-qual-es',
        operationId: 'getAccount',
        authentication: { type: 'password' },
      }),
      PlaygroundValidationError,
    );
  });

  it('derives authentication requirements from effective policies', () => {
    assert.deepEqual(
      authenticationRequirement(revision().operations[0].policies),
      { type: 'apiKey', header: 'x-partner-key' },
    );
    assert.deepEqual(
      authenticationRequirement(revision('oauth-access-token').operations[0].policies),
      { type: 'oauth', requiredScopes: ['banking:read'] },
    );
  });

  it('accepts only URLs for the selected deployment and operation', () => {
    assert.equal(
      validatePlaygroundTarget(
        'https://qual-es.gateway.localhost:8443/es/banking/v1/accounts/42?expand=owner',
        deployment.environment.publicOrigin,
        '/es/banking/v1',
        '/accounts/{id}',
      ).search,
      '?expand=owner',
    );
    assert.throws(
      () => validatePlaygroundTarget(
        'https://evil.example/es/banking/v1/accounts/42',
        deployment.environment.publicOrigin,
        '/es/banking/v1',
        '/accounts/{id}',
      ),
      (error: unknown) => error instanceof PlaygroundValidationError
        && error.code === 'playground_url_not_allowed',
    );
    assert.throws(
      () => validatePlaygroundTarget(
        'https://qual-es.gateway.localhost:8443/es/banking/v1/admin',
        deployment.environment.publicOrigin,
        '/es/banking/v1',
        '/accounts/{id}',
      ),
      (error: unknown) => error instanceof PlaygroundValidationError
        && error.code === 'playground_url_mismatch',
    );
  });

  it('extracts path and query parameters from an edited URL', () => {
    const parsed = parsePlaygroundTarget(
      'https://qual-es.gateway.localhost:8443/es/banking/v1/accounts/customer%201?expand=owner&limit=5',
      deployment.environment.publicOrigin,
      '/es/banking/v1',
      '/accounts/{id}',
    );
    assert.deepEqual(parsed.pathParameters, { id: 'customer 1' });
    assert.deepEqual(parsed.queryParameters, [
      { name: 'expand', value: 'owner' },
      { name: 'limit', value: '5' },
    ]);
  });
});

describe('playground execution', () => {
  it('executes the active operation and redacts API keys from its result', async () => {
    const requests: PlaygroundGatewayRequest[] = [];
    const result = await executePlaygroundRequest({
      proxyId: proxy.id,
      deploymentId: deployment.id,
      operationId: 'getAccount',
      pathParameters: { id: '42' },
      queryParameters: [],
      headers: [],
      authentication: { type: 'apiKey', value: 'dev-key' },
    }, catalog(), {
      async send(request) {
        requests.push(request);
        return response();
      },
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers['x-partner-key'], 'dev-key');
    assert.equal(result.request.headers['x-partner-key'], '<redacted>');
    assert.doesNotMatch(result.request.curl, /dev-key/);
    assert.equal(result.response.status, 200);
  });

  it('exchanges Client Credentials without returning a secret or token', async () => {
    const requests: PlaygroundGatewayRequest[] = [];
    const result = await executePlaygroundRequest({
      proxyId: proxy.id,
      deploymentId: deployment.id,
      operationId: 'getAccount',
      pathParameters: { id: '42' },
      queryParameters: [],
      headers: [],
      authentication: {
        type: 'clientCredentials',
        consumerKey: 'client-key',
        consumerSecret: 'client-secret',
        scope: 'banking:read',
      },
    }, catalog('oauth-access-token'), {
      async send(request) {
        requests.push(request);
        return requests.length === 1
          ? response({ body: '{"access_token":"issued-token"}', durationMs: 8 })
          : response();
      },
    });

    assert.equal(requests.length, 2);
    assert.match(requests[0].headers.authorization, /^Basic /);
    assert.equal(requests[1].headers.authorization, 'Bearer issued-token');
    assert.deepEqual(result.tokenExchange, { status: 200, durationMs: 8 });
    assert.doesNotMatch(JSON.stringify(result), /client-secret|issued-token/);
  });

  it('refuses mTLS execution because the browser does not own the client key', async () => {
    await assert.rejects(
      executePlaygroundRequest({
        proxyId: proxy.id,
        deploymentId: deployment.id,
        operationId: 'getAccount',
        pathParameters: { id: '42' },
        queryParameters: [],
        headers: [],
        authentication: { type: 'none' },
      }, catalog('mtls-auth'), { async send() { return response(); } }),
      (error: unknown) => error instanceof PlaygroundValidationError
        && error.code === 'playground_mtls_requires_local_client',
    );
  });

  it('executes the managed OAuth token operation directly', async () => {
    const managedProxy = { ...proxy, id: 'proxy-platform-oauth', systemManaged: true };
    const managedDeployment = {
      ...deployment,
      proxyId: managedProxy.id,
      revision: { ...deployment.revision, basePath: '/oauth' },
    };
    const managedRevision: ProxyRevisionDetail = {
      ...revision(),
      proxyId: managedProxy.id,
      basePath: '/oauth',
      operations: [{
        ...revision().operations[0],
        operationId: 'issueToken',
        method: 'post',
        mode: 'local',
        path: '/token',
        targetPath: null,
        policies: [{
          id: 'oauth-token',
          type: 'oauth-token',
          enabled: true,
          order: 1,
          config: {
            grantTypes: ['client_credentials'],
            allowedScopes: ['banking:read'],
          },
        }],
      }],
    };
    const requests: PlaygroundGatewayRequest[] = [];
    const result = await executePlaygroundRequest({
      proxyId: managedProxy.id,
      deploymentId: managedDeployment.id,
      operationId: 'issueToken',
      pathParameters: {},
      queryParameters: [],
      headers: [],
      authentication: {
        type: 'clientCredentials',
        consumerKey: 'client-key',
        consumerSecret: 'client-secret',
        scope: 'banking:read',
      },
    }, {
      async getProxy() { return managedProxy; },
      async listDeployments() { return [managedDeployment]; },
      async getRevision() { return managedRevision; },
    }, {
      async send(request) {
        requests.push(request);
        return response({ body: '{"access_token":"manual-token"}' });
      },
    });
    assert.equal(requests.length, 1);
    assert.match(requests[0].headers.authorization, /^Basic /);
    assert.equal(requests[0].body, 'grant_type=client_credentials&scope=banking%3Aread');
    assert.equal(result.response.body, '{"access_token":"manual-token"}');
    assert.doesNotMatch(JSON.stringify(result.request), /client-secret/);
  });
});

describe('playground browser API', () => {
  it('posts JSON to the BFF and preserves stable errors', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let requestInit: RequestInit | undefined;
    globalThis.fetch = async (_input, init) => {
      requestInit = init;
      return new Response(JSON.stringify({ error: 'playground_deployment_not_active' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    };
    await assert.rejects(
      executePlaygroundApi({
        proxyId: proxy.id,
        deploymentId: deployment.id,
        operationId: 'getAccount',
        pathParameters: { id: '42' },
        queryParameters: [],
        headers: [],
        authentication: { type: 'none' },
      }),
      (error: unknown) => error instanceof PlaygroundApiError
        && error.status === 409
        && error.code === 'playground_deployment_not_active',
    );
    assert.equal(requestInit?.method, 'POST');
    assert.equal(new Headers(requestInit?.headers).get('content-type'), 'application/json');
    assert.equal(requestInit?.cache, 'no-store');
  });
});
