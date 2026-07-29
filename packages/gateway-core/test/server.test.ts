import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ProxyConfig } from '@api-gateway/shared';
import { buildServer } from '../src/server';
import { TEST_ENV } from './test-helpers';

describe('gateway operational endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  const proxy: ProxyConfig = {
    id: 'proxy-test',
    name: 'Test proxy',
    basePath: '/configured',
    deploymentId: 'deployment-test',
    revisionId: 'revision-test',
    revisionNumber: 1,
    environment: {
      id: 'env-qual-es',
      stage: 'qual',
      region: 'es',
      publicOrigin: 'https://qual-es.gateway.localhost:8443',
    },
    systemManaged: false,
    upstreamBaseUrl: 'http://upstream.test',
    organizationId: 'org-test',
    active: true,
    endpoints: [{
      id: 'endpoint-test',
      operationId: 'getResource',
      method: 'GET',
      mode: 'forward',
      path: '/resource',
      targetPath: '/resource',
      policies: [],
    }],
  };

  before(async () => {
    server = await buildServer({
      config: TEST_ENV,
      proxies: [proxy],
      logger: false,
    });
  });

  after(async () => server.close());

  it('exposes separate liveness and readiness endpoints', async () => {
    const live = await server.inject({ method: 'GET', url: '/live' });
    const ready = await server.inject({ method: 'GET', url: '/ready' });

    assert.equal(live.statusCode, 200);
    assert.equal(live.json().status, 'alive');
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.json().status, 'ready');
    assert.equal(ready.json().proxiesLoaded, 1);
    assert.equal(ready.json().environmentsLoaded, 1);
  });

  it('does not expose the removed root /health endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'qual-es.gateway.localhost:8443' },
    });

    assert.equal(response.statusCode, 404);
    assert.match(response.json().message, /No proxy is configured/);
  });

  it('returns a routing 404 for an unknown proxy', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/not-configured',
      headers: { host: 'qual-es.gateway.localhost:8443' },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'Not Found');
  });

  it('rejects business requests for an unknown environment host', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/configured/resource',
      headers: { host: 'unknown.gateway.localhost:8443' },
    });

    assert.equal(response.statusCode, 421);
    assert.equal(response.json().error, 'Misdirected Request');
  });

  it('returns 405 and Allow when the path exists for another method', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/configured/resource',
      headers: { host: 'qual-es.gateway.localhost:8443' },
    });

    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, 'GET');
  });
});
