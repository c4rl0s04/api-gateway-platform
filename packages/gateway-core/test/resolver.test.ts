import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProxyConfig } from '@api-gateway/shared';
import {
  getRegistrySize,
  loadProxies,
  resolveEndpoint,
  resolveEnvironment,
  resolveProxy,
} from '../src/proxy/resolver';

function proxy(
  id: string,
  basePath: string,
  endpointPaths: string[],
): ProxyConfig {
  return {
    id,
    name: id,
    basePath,
    deploymentId: `deployment-${id}`,
    revisionId: `revision-${id}`,
    revisionNumber: 1,
    environment: {
      id: 'env-qual-es',
      stage: 'qual',
      region: 'es',
      publicOrigin: 'https://qual-es.gateway.localhost:8443',
    },
    systemManaged: false,
    upstreamBaseUrl: 'http://backend',
    organizationId: 'org-test',
    active: true,
    endpoints: endpointPaths.map((path, index) => ({
      id: `${id}-${index}`,
      operationId: `${id}-operation-${index}`,
      method: 'GET',
      mode: 'forward',
      path,
      targetPath: path,
      policies: [],
    })),
  };
}

describe('proxy resolver', () => {
  it('uses longest-prefix matching and ignores inactive proxies', () => {
    const general = proxy('general', '/api', ['/users']);
    const specific = proxy('specific', '/api/admin', ['/users']);
    const inactive = { ...proxy('inactive', '/off', ['/users']), active: false };

    loadProxies([general, specific, inactive]);

    assert.equal(getRegistrySize(), 2);
    assert.equal(resolveProxy('env-qual-es', '/api/admin/users')?.id, 'specific');
    assert.equal(resolveProxy('env-qual-es', '/api/users')?.id, 'general');
    assert.equal(resolveProxy('env-qual-es', '/off/users'), null);
  });

  it('isolates identical base paths across environments', () => {
    const qual = proxy('qual-api', '/api', ['/users']);
    const prod = {
      ...proxy('prod-api', '/api', ['/users']),
      environment: {
        id: 'env-prod-es',
        stage: 'prod' as const,
        region: 'es' as const,
        publicOrigin: 'https://prod-es.gateway.localhost:8443',
      },
    };

    loadProxies([qual, prod]);

    assert.equal(getRegistrySize(), 2);
    assert.equal(resolveProxy('env-qual-es', '/api/users')?.id, 'qual-api');
    assert.equal(resolveProxy('env-prod-es', '/api/users')?.id, 'prod-api');
    assert.equal(resolveProxy('env-pprod-es', '/api/users'), null);
    assert.equal(
      resolveEnvironment('QUAL-ES.GATEWAY.LOCALHOST:8443')?.id,
      'env-qual-es',
    );
    assert.equal(
      resolveEnvironment('prod-es.gateway.localhost:8443')?.id,
      'env-prod-es',
    );
    assert.equal(resolveEnvironment('unknown.gateway.localhost:8443'), null);
  });

  it('prefers static endpoints and extracts dynamic parameters', () => {
    const configured = proxy('routing', '/api', [
      '/users/{id}',
      '/users/me',
    ]);
    loadProxies([configured]);
    const loaded = resolveProxy('env-qual-es', '/api/users/me');
    assert.ok(loaded);

    const staticMatch = resolveEndpoint(loaded, '/users/me', 'GET');
    const dynamicMatch = resolveEndpoint(loaded, '/users/123', 'GET');

    assert.ok(staticMatch && !('allowedMethods' in staticMatch));
    assert.ok(dynamicMatch && !('allowedMethods' in dynamicMatch));
    assert.equal(staticMatch.endpoint.path, '/users/me');
    assert.deepEqual(dynamicMatch.params, { id: '123' });
    assert.equal(resolveEndpoint(configured, '/unknown', 'GET'), null);
    assert.deepEqual(
      resolveEndpoint(loaded, '/users/123', 'POST'),
      { allowedMethods: ['GET'] },
    );
  });

  it('keeps the last valid registry when a replacement is invalid', () => {
    const current = proxy('current', '/api', ['/users']);
    loadProxies([current]);

    const conflicting = proxy('conflicting', '/api', ['/accounts']);
    assert.throws(
      () => loadProxies([current, conflicting]),
      /multiple active deployments/,
    );

    assert.equal(getRegistrySize(), 1);
    assert.equal(resolveProxy('env-qual-es', '/api/users')?.id, 'current');
  });
});
