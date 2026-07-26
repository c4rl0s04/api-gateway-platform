import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildServer } from '../src/server';
import { TEST_ENV } from './test-helpers';

describe('gateway operational endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  before(async () => {
    server = await buildServer({
      config: TEST_ENV,
      proxies: [],
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
    assert.equal(ready.json().proxiesLoaded, 0);
  });

  it('does not expose the removed root /health endpoint', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 404);
    assert.match(response.json().message, /No proxy is configured/);
  });

  it('returns a routing 404 for an unknown proxy', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/not-configured',
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, 'Not Found');
  });
});
