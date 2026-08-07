import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  createConfiguredProxy,
  describeProxyCreationFailure,
  validateProxyConfiguration,
} from '../lib/proxy-creation-api';
import { ManagementApiError } from '../lib/api-client';

it('formats proxy validation and configured creation multipart requests', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requests: Array<{ input: string; init: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init: init ?? {} });
    return new Response(JSON.stringify({
      openapi: {
        openapiVersion: '3.1.0',
        title: 'Accounts',
        operations: [],
        warnings: [],
      },
      compiled: null,
      proxy: { id: 'proxy-a' },
      revision: { revisionNumber: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await validateProxyConfiguration({
    organizationId: 'org-a',
    openapiSource: 'openapi: 3.1.0',
  });
  await createConfiguredProxy({
    organizationId: 'org-a',
    name: 'Accounts',
    openapiSource: 'openapi: 3.1.0',
    gatewaySource: 'apiVersion: gateway.platform/v1',
  });

  assert.equal(requests[0].input, '/api/management/organizations/org-a/proxy-configurations/validate');
  assert.equal(requests[1].input, '/api/management/organizations/org-a/proxies/configured');
  for (const request of requests) {
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.body instanceof FormData, true);
    assert.equal(new Headers(request.init.headers).has('content-type'), false);
  }
  const creation = requests[1].init.body as FormData;
  assert.equal(creation.get('name'), 'Accounts');
  assert.equal((creation.get('openapi') as File).name, 'openapi.yaml');
  assert.equal((creation.get('gateway') as File).name, 'gateway.yaml');
});

it('maps server failures to the responsible creation step', () => {
  assert.deepEqual(
    describeProxyCreationFailure(new ManagementApiError('invalid', 400, 'invalid_openapi')),
    {
      message: 'The OpenAPI source is invalid. Check its version, references, paths, and operation IDs.',
      step: 1,
    },
  );
  assert.equal(
    describeProxyCreationFailure(new ManagementApiError('invalid', 400, 'unknown_operation')).step,
    2,
  );
  assert.equal(
    describeProxyCreationFailure(new ManagementApiError('too large', 413)).step,
    1,
  );
});
