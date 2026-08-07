import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyOpenApiInspection,
  createEditablePolicy,
  emptyProxyCreationDraft,
  hydrateGatewaySource,
  proxyCreationDraftReducer,
  serializeGatewayConfiguration,
  validatePolicies,
  validateRoutingDraft,
  validateProxyCreationStep,
  validateTargetPath,
} from '../lib/proxy-creation';

const inspection = {
  openapiVersion: '3.1.0',
  title: 'Accounts API',
  warnings: [],
  operations: [
    { operationId: 'listAccounts', method: 'GET', path: '/accounts' },
    { operationId: 'getAccount', method: 'GET', path: '/accounts/{id}' },
  ],
};

describe('proxy creation draft', () => {
  it('hydrates operations from OpenAPI and preserves matching edits', () => {
    const initial = applyOpenApiInspection(emptyProxyCreationDraft(), inspection);
    initial.operations[0].targetPath = '/customers';
    const refreshed = applyOpenApiInspection(initial, inspection);
    assert.equal(refreshed.operations[0].targetPath, '/customers');
    assert.equal(refreshed.operations[1].targetPath, '/accounts/{id}');
  });

  it('reduces focused draft edits without mutating unrelated state', () => {
    const identity = proxyCreationDraftReducer(emptyProxyCreationDraft(), {
      type: 'set-identity',
      organizationId: 'org-a',
      name: 'Accounts',
    });
    const withSource = proxyCreationDraftReducer(identity, {
      type: 'set-openapi-source',
      source: 'openapi: 3.1.0',
      filename: 'accounts.yaml',
    });
    assert.equal(withSource.organizationId, 'org-a');
    assert.equal(withSource.name, 'Accounts');
    assert.equal(withSource.openapiSourceName, 'accounts.yaml');
    assert.notEqual(withSource, identity);
  });

  it('reports local validity for every creation step', () => {
    let draft = emptyProxyCreationDraft();
    assert.equal(validateProxyCreationStep(draft, 0).valid, false);
    draft = proxyCreationDraftReducer(draft, {
      type: 'set-identity',
      organizationId: 'org-a',
      name: 'Accounts',
    });
    assert.equal(validateProxyCreationStep(draft, 0).valid, true);
    assert.equal(validateProxyCreationStep(draft, 1).valid, false);
    draft = proxyCreationDraftReducer(draft, {
      type: 'set-openapi-source',
      source: 'openapi: 3.1.0',
      filename: 'accounts.yaml',
    });
    assert.equal(validateProxyCreationStep(draft, 1).valid, true);
    assert.equal(validateProxyCreationStep(draft, 2).valid, false);
  });

  it('hydrates imported gateway YAML into editable defaults and overrides', () => {
    const draft = applyOpenApiInspection(emptyProxyCreationDraft(), inspection);
    const hydrated = hydrateGatewaySource(draft, `
apiVersion: gateway.platform/v1
basePath: /banking/v1
defaults:
  policies:
    - type: api-key-auth
      config: {header: x-client-key, failureMode: closed}
operations:
  getAccount:
    targetPath: /customers/{id}
    policies:
      - type: oauth-access-token
        config:
          audience: gateway
          requiredScopes: [banking:read]
`);
    assert.equal(hydrated.basePath, '/banking/v1');
    assert.equal(hydrated.defaultPolicies[0].header, 'x-client-key');
    assert.equal(hydrated.operations[0].inheritPolicies, true);
    assert.equal(hydrated.operations[1].inheritPolicies, false);
    assert.equal(hydrated.operations[1].targetPath, '/customers/{id}');
  });

  it('serializes normalized business gateway configuration', () => {
    let draft = applyOpenApiInspection(emptyProxyCreationDraft(), inspection);
    draft = {
      ...draft,
      basePath: '/banking/v1',
      defaultPolicies: [createEditablePolicy('mtls-auth', 'policy-1')],
    };
    const source = serializeGatewayConfiguration(draft);
    assert.match(source, /apiVersion: gateway\.platform\/v1/);
    assert.match(source, /basePath: \/banking\/v1/);
    assert.match(source, /type: mtls-auth/);
    assert.doesNotMatch(source, /mode:/);
  });

  it('validates authentication exclusivity and policy configuration', () => {
    const apiKey = createEditablePolicy('api-key-auth', 'api-key');
    const mtls = createEditablePolicy('mtls-auth', 'mtls');
    assert.equal(validatePolicies([apiKey, mtls]).valid, false);
    mtls.enabled = false;
    assert.equal(validatePolicies([apiKey, mtls]).valid, true);
    const oauth = createEditablePolicy('oauth-access-token', 'oauth');
    assert.match(validatePolicies([oauth]).errors[0], /audience/);
  });

  it('validates target parameters and the complete routing draft', () => {
    assert.equal(validateTargetPath('/accounts/{id}', '/customers/{id}').valid, true);
    assert.equal(validateTargetPath('/accounts/{id}', '/customers/{missing}').valid, false);
    const draft = applyOpenApiInspection(emptyProxyCreationDraft(), inspection);
    draft.basePath = '/banking/v1';
    assert.equal(validateRoutingDraft(draft).valid, true);
    draft.operations[1].targetPath = 'customers/{id}';
    assert.equal(validateRoutingDraft(draft).valid, false);
  });
});
