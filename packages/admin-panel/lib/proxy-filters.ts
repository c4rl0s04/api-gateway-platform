import type {
  ApiProxySummary,
  DeploymentStage,
  Environment,
} from '@/lib/api-client';

export type ProxyStateFilter = 'all' | 'active' | 'inactive' | 'system';

export interface ProxyFilters {
  query: string;
  organizationId: string | null;
  countries: string[];
  stages: DeploymentStage[];
  state: ProxyStateFilter;
}

type SearchParamsReader = Pick<URLSearchParams, 'get'>;

const deploymentStages: DeploymentStage[] = ['qual', 'pprod', 'prod'];
const deploymentStageSet = new Set<string>(deploymentStages);
const proxyStateSet = new Set<ProxyStateFilter>(['active', 'inactive', 'system']);

export const defaultProxyFilters: ProxyFilters = {
  query: '',
  organizationId: null,
  countries: [],
  stages: [],
  state: 'all',
};

function parseList(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean))];
}

export function parseProxyFilters(searchParams: SearchParamsReader): ProxyFilters {
  const state = searchParams.get('state')?.toLowerCase() as ProxyStateFilter | undefined;
  const stages = parseList(searchParams.get('stage'))
    .filter((stage): stage is DeploymentStage => deploymentStageSet.has(stage))
    .sort((left, right) => deploymentStages.indexOf(left) - deploymentStages.indexOf(right));

  return {
    query: searchParams.get('q') ?? '',
    organizationId: searchParams.get('organization') || null,
    countries: parseList(searchParams.get('country'))
      .filter(country => /^[a-z]{2}$/.test(country))
      .sort(),
    stages,
    state: state && proxyStateSet.has(state) ? state : 'all',
  };
}

export function serializeProxyFilters(filters: ProxyFilters): string {
  const searchParams = new URLSearchParams();
  const query = filters.query.trim();
  if (query) searchParams.set('q', query);
  if (filters.countries.length > 0) {
    searchParams.set('country', [...new Set(filters.countries)].sort().join(','));
  }
  if (filters.stages.length > 0) {
    searchParams.set('stage', [...new Set(filters.stages)]
      .sort((left, right) => deploymentStages.indexOf(left) - deploymentStages.indexOf(right))
      .join(','));
  }
  if (filters.organizationId) searchParams.set('organization', filters.organizationId);
  if (filters.state !== 'all') searchParams.set('state', filters.state);
  return searchParams.toString();
}

export function proxyMatchesFilters(
  proxy: ApiProxySummary,
  filters: ProxyFilters,
  environmentsById: ReadonlyMap<string, Environment>,
): boolean {
  if (filters.organizationId && proxy.organizationId !== filters.organizationId) return false;
  if (filters.state === 'active' && (!proxy.active || proxy.systemManaged)) return false;
  if (filters.state === 'inactive' && proxy.active) return false;
  if (filters.state === 'system' && !proxy.systemManaged) return false;

  if (filters.countries.length > 0 || filters.stages.length > 0) {
    const countries = new Set(filters.countries);
    const stages = new Set(filters.stages);
    const hasMatchingDeployment = proxy.deployments.some(deployment => {
      const environment = environmentsById.get(deployment.environmentId);
      return environment
        && (countries.size === 0 || countries.has(environment.region))
        && (stages.size === 0 || stages.has(environment.stage));
    });
    if (!hasMatchingDeployment) return false;
  }

  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const revision = proxy.revisions[0];
  return [proxy.name, proxy.id, revision?.basePath, proxy.organization.name]
    .some(value => value?.toLowerCase().includes(query));
}

export function filterProxies(
  proxies: ApiProxySummary[],
  filters: ProxyFilters,
  environmentsById: ReadonlyMap<string, Environment>,
): ApiProxySummary[] {
  return proxies.filter(proxy => proxyMatchesFilters(proxy, filters, environmentsById));
}

export function activeProxyFilterCount(filters: ProxyFilters): number {
  return Number(filters.countries.length > 0)
    + Number(filters.stages.length > 0)
    + Number(Boolean(filters.organizationId))
    + Number(filters.state !== 'all');
}
