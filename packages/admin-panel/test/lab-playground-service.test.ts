import assert from 'node:assert/strict';
import test from 'node:test';

test('lab playground catalog replaces only the deployment hostname', async () => {
  const { createLabPlaygroundCatalog } = await import('../lib/lab-playground-service.js');
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push(url.pathname);
    if (url.pathname.endsWith('/workspace')) {
      return Response.json({ hostname: 'workspace-1.lab.gateway.localhost' });
    }
    if (url.pathname.endsWith('/deployments')) {
      return Response.json([{
        id: 'deployment-1',
        environment: {
          id: 'qual-es',
          stage: 'qual',
          region: 'es',
          publicOrigin: 'https://qual-es.gateway.localhost:8443',
        },
      }]);
    }
    return Response.json({ id: 'resource-1' });
  }) as typeof fetch;

  const catalog = await createLabPlaygroundCatalog('token', fetcher);
  const deployments = await catalog.listDeployments('proxy-1');

  assert.equal(
    deployments[0]?.environment.publicOrigin,
    'https://workspace-1.lab.gateway.localhost:8443',
  );
  assert.deepEqual(requests, [
    '/lab/v1/workspace',
    '/lab/v1/proxies/proxy-1/deployments',
  ]);
});

test('lab playground catalog preserves upstream error status', async () => {
  const {
    createLabPlaygroundCatalog,
    LabPlaygroundCatalogError,
  } = await import('../lib/lab-playground-service.js');
  const fetcher = (async () => Response.json(
    { error: 'lab_expired', message: 'Lab workspace has expired' },
    { status: 410 },
  )) as typeof fetch;

  await assert.rejects(
    () => createLabPlaygroundCatalog('token', fetcher),
    (error: unknown) => error instanceof LabPlaygroundCatalogError
      && error.status === 410
      && error.message === 'Lab workspace has expired',
  );
});
