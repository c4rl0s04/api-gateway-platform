import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeveloperTokenRequest } from '@api-gateway/shared';
import type { ManagementEnv } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import {
  DeveloperTokenService,
  type DeveloperTokenCatalog,
  type DeveloperTokenIssuer,
  type DeveloperTokenOperations,
  type DeveloperTokenSelection,
} from '../src/services/developer-tokens.js';

const request: DeveloperTokenRequest = {
  environmentId: 'env-qual-es',
  productIds: ['product-banking'],
  proxyIds: ['proxy-accounts', 'proxy-payments'],
  scopes: ['banking:read'],
  ttlSeconds: 600,
};

const selection: DeveloperTokenSelection = {
  organizationKind: 'standard',
  environment: {
    id: 'env-qual-es',
    stage: 'qual',
    publicOrigin: 'https://qual-es.gateway.test',
  },
  products: [{
    id: 'product-banking',
    scopes: ['banking:read', 'banking:write'],
    proxyIds: ['proxy-accounts', 'proxy-payments'],
    environmentIds: [],
  }],
  activeProxies: [
    { id: 'proxy-accounts', systemManaged: false },
    { id: 'proxy-payments', systemManaged: false },
  ],
};

function catalogFor(
  selected: DeveloperTokenSelection = selection,
  recorded: string[] = [],
): DeveloperTokenCatalog {
  return {
    loadSelection: async () => selected,
    recordIssue: async input => {
      recorded.push(`${input.organizationId}:${input.grantId}`);
    },
  };
}

const issuer: DeveloperTokenIssuer = {
  issue: async ({ assertion, tokenEndpoint }) => {
    assert.equal(assertion.split('.').length, 3);
    assert.equal(tokenEndpoint, 'https://qual-es.gateway.test/oauth/token');
    return { accessToken: 'signed-developer-token', expiresIn: 600 };
  },
};

const organizationAdmin = {
  issuer: 'https://identity.test',
  subject: 'organization-admin',
  memberships: [{
    id: 'membership-org-a',
    role: 'organizationAdmin' as const,
    organizationId: 'org-a',
    active: true,
  }],
};

describe('developer token domain', () => {
  it('issues an audited token for multiple active proxies in the actor organization', async () => {
    const recorded: string[] = [];
    const service = new DeveloperTokenService(
      'a'.repeat(32),
      issuer,
      catalogFor(selection, recorded),
    );
    const result = await service.issue('org-a', request, organizationAdmin);

    assert.equal(result.accessToken, 'signed-developer-token');
    assert.deepEqual(result.authorizedProxies, request.proxyIds);
    assert.equal(recorded.length, 1);
  });

  it('rejects viewers and organization admins from another organization', async () => {
    const service = new DeveloperTokenService('a'.repeat(32), issuer, catalogFor());
    await assert.rejects(
      service.issue('org-a', request, {
        ...organizationAdmin,
        memberships: [{
          ...organizationAdmin.memberships[0],
          role: 'viewer',
        }],
      }),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
    await assert.rejects(
      service.issue('org-b', request, organizationAdmin),
      (error: unknown) => (error as { code?: string }).code === 'forbidden',
    );
  });

  it('rejects production environments and proxies outside selected products', async () => {
    const production = {
      ...selection,
      environment: { ...selection.environment!, stage: 'prod' },
    };
    await assert.rejects(
      new DeveloperTokenService('a'.repeat(32), issuer, catalogFor(production))
        .issue('org-a', request, organizationAdmin),
      (error: unknown) =>
        (error as { code?: string }).code === 'developer_token_environment_forbidden',
    );
    const missingProxy = {
      ...selection,
      products: [{ ...selection.products[0], proxyIds: ['proxy-accounts'] }],
    };
    await assert.rejects(
      new DeveloperTokenService('a'.repeat(32), issuer, catalogFor(missingProxy))
        .issue('org-a', request, organizationAdmin),
      (error: unknown) =>
        (error as { code?: string }).code === 'developer_token_proxy_invalid',
    );
  });
});

const config: ManagementEnv = {
  HOST: '127.0.0.1',
  PORT: 3002,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'https://identity.test/realms/platform',
  OIDC_AUDIENCE: 'management-api',
  PKI_KEYSTORE_DIR: '/tmp/test-pki-keys',
  PKI_MASTER_KEY_FILE: '/tmp/test-pki-master.key',
  PKI_TRUST_BUNDLE_FILE: '/tmp/test-trust-bundle.pem',
  PKI_CRL_BUNDLE_FILE: '/tmp/test-crl-bundle.pem',
  PKI_SDS_TRIGGER_FILE: '/tmp/test-client-validation.yaml',
};

describe('developer token route', () => {
  it('validates and forwards the authorized request with no-store headers', async () => {
    const calls: DeveloperTokenRequest[] = [];
    const operations: DeveloperTokenOperations = {
      issue: async (_organizationId, input) => {
        calls.push(input);
        return {
          accessToken: 'token',
          tokenType: 'Bearer',
          expiresIn: input.ttlSeconds,
          authorizedProxies: input.proxyIds,
          scopes: input.scopes,
        };
      },
    };
    const server = buildServer({
      config,
      logger: false,
      verifier: {
        verify: async () => ({ issuer: config.OIDC_ISSUER, subject: 'admin', claims: {} }),
      },
      memberships: { findActive: async () => organizationAdmin.memberships },
      developerTokens: operations,
    });
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organizations/org-a/developer-tokens',
      headers: { authorization: 'Bearer oidc-token' },
      payload: { ...request, ttlSeconds: undefined },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(calls[0].ttlSeconds, 600);
    await server.close();
  });
});
