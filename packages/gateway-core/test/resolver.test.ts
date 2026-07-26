import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProxyConfig } from '@api-gateway/shared';
import {
  getRegistrySize,
  loadProxies,
  resolveEndpoint,
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
    environment: {
      id: 'env-qual-es',
      stage: 'qual',
      region: 'es',
    },
    systemManaged: false,
    upstreamBaseUrl: 'http://backend',
    organizationId: 'org-test',
    active: true,
    endpoints: endpointPaths.map((path, index) => ({
      id: `${id}-${index}`,
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
    assert.equal(resolveProxy('/api/admin/users')?.id, 'specific');
    assert.equal(resolveProxy('/api/users')?.id, 'general');
    assert.equal(resolveProxy('/off/users'), null);
  });

  it('prefers static endpoints and extracts dynamic parameters', () => {
    const configured = proxy('routing', '/api', [
      '/users/:id',
      '/users/me',
    ]);
    loadProxies([configured]);

    const staticMatch = resolveEndpoint(configured, '/users/me');
    const dynamicMatch = resolveEndpoint(configured, '/users/123');

    assert.equal(staticMatch?.endpoint.path, '/users/me');
    assert.deepEqual(dynamicMatch?.params, { id: '123' });
    assert.equal(resolveEndpoint(configured, '/unknown'), null);
  });
});
