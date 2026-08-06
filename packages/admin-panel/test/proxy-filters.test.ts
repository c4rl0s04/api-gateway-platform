import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiProxySummary, Environment } from '../lib/api-client.js';
import {
  activeProxyFilterCount,
  parseProxyFilters,
  proxyMatchesFilters,
  serializeProxyFilters,
  type ProxyFilters,
} from '../lib/proxy-filters.js';

const environments: Environment[] = [
  { id: 'qual-es', stage: 'qual', region: 'es', publicOrigin: 'https://qual-es.test', createdAt: '', _count: { deployments: 1, products: 0 } },
  { id: 'prod-es', stage: 'prod', region: 'es', publicOrigin: 'https://prod-es.test', createdAt: '', _count: { deployments: 1, products: 0 } },
  { id: 'prod-us', stage: 'prod', region: 'us', publicOrigin: 'https://prod-us.test', createdAt: '', _count: { deployments: 1, products: 0 } },
];
const environmentsById = new Map(environments.map(environment => [environment.id, environment]));

function proxy(environmentIds: string[], overrides: Partial<ApiProxySummary> = {}): ApiProxySummary {
  return {
    id: 'accounts',
    name: 'Accounts API',
    active: true,
    systemManaged: false,
    organizationId: 'org-bank',
    organization: { id: 'org-bank', name: 'Banking' },
    createdAt: '',
    updatedAt: '',
    _count: { revisions: 1, deployments: environmentIds.length, products: 1 },
    revisions: [{ id: 'revision-1', proxyId: 'accounts', revisionNumber: 1, basePath: '/accounts', openapiVersion: '3.1.0', contentHash: 'hash', createdAt: '' }],
    deployments: environmentIds.map((environmentId, index) => ({ id: `deployment-${index}`, environmentId, revisionId: 'revision-1', status: 'active' })),
    ...overrides,
  };
}

const filters = (overrides: Partial<ProxyFilters>): ProxyFilters => ({
  query: '',
  organizationId: null,
  countries: [],
  stages: [],
  state: 'all',
  ...overrides,
});

describe('proxy filter state', () => {
  it('parses and serializes stable shareable URLs', () => {
    const parsed = parseProxyFilters(new URLSearchParams('q=accounts&country=us,es,es&stage=prod,qual,unknown&organization=org-bank&state=active'));
    assert.deepEqual(parsed, {
      query: 'accounts',
      organizationId: 'org-bank',
      countries: ['es', 'us'],
      stages: ['qual', 'prod'],
      state: 'active',
    });
    assert.equal(
      serializeProxyFilters(parsed),
      'q=accounts&country=es%2Cus&stage=qual%2Cprod&organization=org-bank&state=active',
    );
  });

  it('applies OR inside a facet and AND between country and stage', () => {
    const splitDeployments = proxy(['qual-es', 'prod-us']);
    assert.equal(proxyMatchesFilters(splitDeployments, filters({ countries: ['es'], stages: ['prod'] }), environmentsById), false);
    assert.equal(proxyMatchesFilters(splitDeployments, filters({ countries: ['es', 'us'], stages: ['prod'] }), environmentsById), true);
    assert.equal(proxyMatchesFilters(splitDeployments, filters({ countries: ['es'] }), environmentsById), true);
    assert.equal(proxyMatchesFilters(splitDeployments, filters({ stages: ['prod'] }), environmentsById), true);
  });

  it('combines deployment facets with organization, state, and search', () => {
    const candidate = proxy(['prod-es']);
    assert.equal(proxyMatchesFilters(candidate, filters({ organizationId: 'org-bank', state: 'active', query: '/accounts' }), environmentsById), true);
    assert.equal(proxyMatchesFilters(candidate, filters({ organizationId: 'org-other' }), environmentsById), false);
    assert.equal(proxyMatchesFilters(candidate, filters({ state: 'system' }), environmentsById), false);
    assert.equal(proxyMatchesFilters(candidate, filters({ query: 'missing' }), environmentsById), false);
  });

  it('counts active facets rather than individual selections', () => {
    assert.equal(activeProxyFilterCount(filters({ countries: ['es', 'us'], stages: ['qual', 'prod'], state: 'active' })), 3);
  });
});
