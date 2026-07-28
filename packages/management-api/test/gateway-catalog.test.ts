import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import {
  readableOrganizationIds,
  type GatewayCatalogOperations,
} from '../src/services/gateway-catalog.js';
import type { AdminPrincipal } from '../src/auth/authorization.js';

const config: ManagementEnv = {
  HOST: '127.0.0.1',
  PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  OIDC_ISSUER: 'https://identity.test/realms/platform',
  OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys',
  PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust-bundle.pem',
  PKI_CRL_BUNDLE_FILE: '/tmp/test-crl-bundle.pem',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-client-validation.yaml',
};

function principal(role: 'platformAdmin' | 'viewer'): AdminPrincipal {
  return {
    issuer: config.OIDC_ISSUER,
    subject: role,
    memberships: [{
      id: `membership-${role}`,
      role,
      organizationId: role === 'platformAdmin' ? null : 'org-a',
      active: true,
    }],
  };
}

describe('gateway catalog management API', () => {
  it('derives organization visibility from active memberships', () => {
    assert.equal(readableOrganizationIds(principal('platformAdmin')), undefined);
    assert.deepEqual(readableOrganizationIds(principal('viewer')), ['org-a']);
  });

  it('exposes environments, proxies, details, and deployments', async () => {
    const calls: string[] = [];
    const catalog: GatewayCatalogOperations = {
      listEnvironments: async () => {
        calls.push('environments');
        return [{ id: 'env-qual-es' }];
      },
      listProxies: async () => {
        calls.push('proxies');
        return [{ id: 'proxy-1' }];
      },
      getProxy: async id => {
        calls.push(`proxy:${id}`);
        return { id };
      },
      listDeployments: async id => {
        calls.push(`deployments:${id}`);
        return [{ id: 'deployment-1', proxyId: id }];
      },
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: {
        verify: async () => ({
          issuer: config.OIDC_ISSUER,
          subject: 'viewer',
          claims: {},
        }),
      },
      memberships: {
        findActive: async () => principal('viewer').memberships,
      },
      gatewayCatalog: catalog,
    });
    const headers = { authorization: 'Bearer token' };

    for (const route of [
      '/v1/environments',
      '/v1/proxies',
      '/v1/proxies/proxy-1',
      '/v1/proxies/proxy-1/deployments',
    ]) {
      const response = await server.inject({ method: 'GET', url: route, headers });
      assert.equal(response.statusCode, 200);
    }
    assert.deepEqual(calls, [
      'environments',
      'proxies',
      'proxy:proxy-1',
      'deployments:proxy-1',
    ]);
    await server.close();
  });
});
