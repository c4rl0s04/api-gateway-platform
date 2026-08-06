import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  ManagementApiError,
  managementFetch,
} from '../lib/api-client.js';

it('formats Management API JSON, multipart, and error responses correctly', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init ?? {});
    return new Response(JSON.stringify({ id: 'proxy-a' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  await managementFetch('organizations/org-a/proxies', {
    method: 'POST',
    body: JSON.stringify({ name: 'Accounts' }),
  });
  assert.equal(new Headers(requests[0].headers).get('content-type'), 'application/json');
  assert.equal(requests[0].cache, 'no-store');

  const bundle = new FormData();
  bundle.set('openapi', new Blob(['openapi: 3.1.0']), 'openapi.yaml');
  await managementFetch('proxies/proxy-a/revisions', { method: 'POST', body: bundle });
  assert.equal(new Headers(requests[1].headers).has('content-type'), false);

  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'promotion_required',
    message: 'Promote this revision first.',
    details: { stage: 'qual' },
  }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  });

  await assert.rejects(
    managementFetch('proxies/proxy-a/revisions/4/deployments', { method: 'POST' }),
    (cause: unknown) => cause instanceof ManagementApiError
      && cause.status === 409
      && cause.code === 'promotion_required'
      && cause.message === 'Promote this revision first.',
  );
});
