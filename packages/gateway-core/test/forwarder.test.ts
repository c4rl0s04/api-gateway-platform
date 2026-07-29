import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { ProxyConfig } from '@api-gateway/shared';
import { buildServer } from '../src/server';
import { TEST_ENV } from './test-helpers';

describe('gateway forwarding', () => {
  let upstream: Server;
  let gateway: Awaited<ReturnType<typeof buildServer>>;

  before(async () => {
    upstream = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        response.statusCode = 201;
        response.setHeader(
          'content-type',
          request.headers['content-type'] ?? 'application/octet-stream',
        );
        response.setHeader('x-upstream-url', request.url ?? '');
        response.setHeader(
          'x-upstream-custom',
          String(request.headers['x-client-custom'] ?? ''),
        );
        response.end(Buffer.concat(chunks));
      });
    });

    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject);
      upstream.listen(0, '127.0.0.1', resolve);
    });
    const port = (upstream.address() as AddressInfo).port;

    const proxies: ProxyConfig[] = [{
      id: 'proxy-echo',
      name: 'Echo proxy',
      basePath: '/api',
      deploymentId: 'deployment-echo',
      revisionId: 'revision-echo',
      revisionNumber: 1,
      environment: {
        id: 'env-qual-es',
        stage: 'qual',
        region: 'es',
        publicOrigin: 'https://qual-es.gateway.localhost:8443',
      },
      systemManaged: false,
      upstreamBaseUrl: `http://127.0.0.1:${port}/service`,
      organizationId: 'org-test',
      active: true,
      endpoints: [
        {
          id: 'echo',
          operationId: 'echo',
          method: 'POST',
          mode: 'forward',
          path: '/echo',
          targetPath: '/echo',
          policies: [],
        },
        {
          id: 'backend-health',
          operationId: 'backendHealth',
          method: 'GET',
          mode: 'forward',
          path: '/health',
          targetPath: '/backend-health',
          policies: [],
        },
      ],
    }];

    gateway = await buildServer({
      config: TEST_ENV,
      proxies,
      logger: false,
    });
  });

  after(async () => {
    await gateway.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close(error => error ? reject(error) : resolve());
    });
  });

  const payloads = [
    {
      name: 'JSON',
      contentType: 'application/json',
      payload: Buffer.from('{"amount":12.50,"valid":true}'),
    },
    {
      name: 'text',
      contentType: 'text/plain; charset=utf-8',
      payload: Buffer.from('plain text payload'),
    },
    {
      name: 'binary',
      contentType: 'application/octet-stream',
      payload: Buffer.from([0, 1, 2, 127, 128, 255]),
    },
    {
      name: 'multipart',
      contentType: 'multipart/form-data; boundary=test-boundary',
      payload: Buffer.from(
        '--test-boundary\r\n'
        + 'Content-Disposition: form-data; name="field"\r\n\r\n'
        + 'value\r\n--test-boundary--\r\n',
      ),
    },
  ];

  for (const sample of payloads) {
    it(`preserves ${sample.name} request and response bytes`, async () => {
      const response = await gateway.inject({
        method: 'POST',
        url: '/api/echo?source=gateway',
        headers: {
          host: 'qual-es.gateway.localhost:8443',
          'content-type': sample.contentType,
          'x-client-custom': 'preserved',
        },
        payload: sample.payload,
      });

      assert.equal(response.statusCode, 201);
      assert.deepEqual(response.rawPayload, sample.payload);
      assert.equal(response.headers['x-upstream-url'], '/service/echo?source=gateway');
      assert.equal(response.headers['x-upstream-custom'], 'preserved');
      assert.equal(response.headers['x-gateway-proxy'], 'proxy-echo');
    });
  }

  it('keeps configured backend /health routes distinct from gateway status', async () => {
    const response = await gateway.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'qual-es.gateway.localhost:8443' },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['x-upstream-url'], '/service/backend-health');
  });
});
