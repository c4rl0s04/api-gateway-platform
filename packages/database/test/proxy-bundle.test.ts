import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileProxyBundle, ProxyBundleError } from '../src/proxy-bundle.js';

function openapi(version = '3.1.0'): string {
  return `
openapi: ${version}
info:
  title: Accounts
  version: 1.0.0
paths:
  /accounts:
    get:
      operationId: getAccounts
      responses:
        '200':
          description: OK
  /accounts/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      operationId: getAccount
      responses:
        '200':
          description: OK
`;
}

const gateway = `
apiVersion: gateway.platform/v1
basePath: /es/banking/v1/
defaults:
  policies:
    - type: api-key-auth
      config:
        failureMode: closed
operations:
  getAccount:
    targetPath: /customers/{id}
    policies:
      - type: oauth-access-token
        config:
          audience: api-gateway
          requiredScopes: [banking:read]
`;

describe('proxy bundle compiler', () => {
  for (const version of ['3.0.3', '3.1.0']) {
    it(`compiles OpenAPI ${version} with inherited and replaced policies`, async () => {
      const result = await compileProxyBundle({
        openapiSource: openapi(version),
        gatewayConfigSource: gateway,
      });
      assert.equal(result.basePath, '/es/banking/v1');
      assert.equal(result.operations[0].policies[0].type, 'api-key-auth');
      assert.equal(result.operations[1].policies[0].type, 'oauth-access-token');
      assert.equal(result.operations[1].targetPath, '/customers/{id}');
      assert.match(result.contentHash, /^[a-f0-9]{64}$/);
    });
  }

  it('rejects Swagger 2.0 and external references', async () => {
    await assert.rejects(
      compileProxyBundle({
        openapiSource: 'swagger: "2.0"\ninfo: {title: Test, version: 1}\npaths: {}',
        gatewayConfigSource: gateway,
      }),
      (error: unknown) => error instanceof ProxyBundleError && error.code === 'invalid_openapi',
    );
    await assert.rejects(
      compileProxyBundle({
        openapiSource: `${openapi()}\ncomponents:\n  schemas:\n    External:\n      $ref: https://example.test/schema.yaml`,
        gatewayConfigSource: gateway,
      }),
      /External OpenAPI reference is not allowed/,
    );
  });

  it('requires operationId and rejects unknown gateway operations', async () => {
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi().replace('operationId: getAccounts', 'summary: Accounts'),
        gatewayConfigSource: gateway,
      }),
      /requires operationId/,
    );
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi(),
        gatewayConfigSource: `${gateway}\n  missingOperation:\n    targetPath: /missing`,
      }),
      (error: unknown) => error instanceof ProxyBundleError && error.code === 'unknown_operation',
    );
  });

  it('rejects unsupported policies and multiple authentication policies', async () => {
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi(),
        gatewayConfigSource: gateway.replace('api-key-auth', 'transform'),
      }),
      (error: unknown) => error instanceof ProxyBundleError && error.code === 'policy_not_supported',
    );
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi(),
        gatewayConfigSource: gateway.replace(
          '    - type: api-key-auth',
          '    - type: api-key-auth\n    - type: mtls-auth',
        ),
      }),
      /more than one authentication policy/,
    );
  });

  it('rejects non-boolean policy state and unknown operation modes', async () => {
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi(),
        gatewayConfigSource: gateway.replace(
          '    - type: api-key-auth',
          '    - type: api-key-auth\n      enabled: "false"',
        ),
      }),
      /enabled must be a boolean/,
    );
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi(),
        gatewayConfigSource: gateway.replace(
          '    targetPath: /customers/{id}',
          '    mode: passthrough\n    targetPath: /customers/{id}',
        ),
        systemManaged: true,
      }),
      /mode must be forward or local/,
    );
  });

  it('rejects target parameters missing from the public path', async () => {
    await assert.rejects(
      compileProxyBundle({
        openapiSource: openapi(),
        gatewayConfigSource: gateway.replace('/customers/{id}', '/customers/{missing}'),
      }),
      /is not declared/,
    );
  });
});
