'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowIcon,
  PlusIcon,
  ProxyIcon,
  RefreshIcon,
} from '@/components/gateway-icons';
import { ProxyFilterBar } from '@/components/proxy-filters/proxy-filter-bar';
import type {
  CountedOption,
  OrganizationOption,
  StageOption,
} from '@/components/proxy-filters/types';
import { useAdminSession } from '@/components/session-context';
import {
  managementFetch,
  type ApiProxySummary,
  type Environment,
  type Organization,
  type RuntimeSyncStatus,
} from '@/lib/api-client';
import {
  deploymentRegionCode,
  deploymentRegionLabel,
  sortDeploymentRegions,
} from '@/lib/deployment-regions';
import { canManageOrganization } from '@/lib/proxy-control';
import {
  filterProxies,
  parseProxyFilters,
  serializeProxyFilters,
  type ProxyFilters,
  type ProxyStateFilter,
} from '@/lib/proxy-filters';

const stageDefinitions: Array<Omit<StageOption, 'count'>> = [
  { value: 'qual', label: 'QUAL', description: 'Validation traffic' },
  { value: 'pprod', label: 'PPROD', description: 'Pre-production traffic' },
  { value: 'prod', label: 'PROD', description: 'Production traffic' },
];

const stateDefinitions: Array<{ value: Exclude<ProxyStateFilter, 'all'>; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'system', label: 'System-managed' },
];

export function ProxyInventoryWorkspace() {
  const session = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseProxyFilters(searchParams), [searchParams]);
  const [proxies, setProxies] = useState<ApiProxySummary[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [runtime, setRuntime] = useState<RuntimeSyncStatus | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isRefreshing, setRefreshing] = useState(false);
  const [isCreating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!quiet) setRefreshing(true);
    try {
      const [nextProxies, nextOrganizations, nextEnvironments, nextRuntime] = await Promise.all([
        managementFetch<ApiProxySummary[]>('proxies', { signal: controller.signal }),
        managementFetch<Organization[]>('organizations', { signal: controller.signal }),
        managementFetch<Environment[]>('environments', { signal: controller.signal }),
        managementFetch<RuntimeSyncStatus>('runtime-sync', { signal: controller.signal }),
      ]);
      setProxies(nextProxies);
      setOrganizations(nextOrganizations);
      setEnvironments(nextEnvironments);
      setRuntime(nextRuntime);
      setError('');
      setLastUpdated(new Date());
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') {
        setError((cause as Error).message);
      }
    } finally {
      if (requestRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      requestRef.current?.abort();
    };
  }, [refresh]);

  const environmentMap = useMemo(
    () => new Map(environments.map(environment => [environment.id, environment])),
    [environments],
  );

  const writableOrganizations = useMemo(
    () => organizations.filter(organization =>
      canManageOrganization(session, organization.id)),
    [organizations, session],
  );

  const navigateToFilters = useCallback((nextFilters: ProxyFilters, mode: 'push' | 'replace') => {
    const queryString = serializeProxyFilters(nextFilters);
    const href = queryString ? `${pathname}?${queryString}` : pathname;
    if (mode === 'replace') router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [pathname, router]);

  const commitFilters = useCallback((nextFilters: ProxyFilters) => {
    navigateToFilters(nextFilters, 'push');
  }, [navigateToFilters]);

  const changeSearch = useCallback((query: string) => {
    navigateToFilters({ ...filters, query }, 'replace');
  }, [filters, navigateToFilters]);

  const filteredProxies = useMemo(
    () => filterProxies(proxies, filters, environmentMap),
    [environmentMap, filters, proxies],
  );

  const countryOptions = useMemo<CountedOption[]>(() =>
    sortDeploymentRegions(environments.map(environment => environment.region))
      .map(country => ({
        value: country,
        label: deploymentRegionLabel(country),
        code: deploymentRegionCode(country),
        count: filterProxies(proxies, { ...filters, countries: [country] }, environmentMap).length,
      })), [environmentMap, environments, filters, proxies]);

  const stageOptions = useMemo<StageOption[]>(() =>
    stageDefinitions.map(stage => ({
      ...stage,
      count: filterProxies(proxies, { ...filters, stages: [stage.value] }, environmentMap).length,
    })), [environmentMap, filters, proxies]);

  const organizationOptions = useMemo<OrganizationOption[]>(() =>
    organizations.map(organization => ({
      ...organization,
      count: filterProxies(proxies, { ...filters, organizationId: organization.id }, environmentMap).length,
    })), [environmentMap, filters, organizations, proxies]);

  const stateOptions = useMemo<CountedOption[]>(() =>
    stateDefinitions.map(state => ({
      ...state,
      count: filterProxies(proxies, { ...filters, state: state.value }, environmentMap).length,
    })), [environmentMap, filters, proxies]);

  async function createProxy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const selectedOrganization = String(data.get('organizationId'));
    setCreating(true);
    setError('');
    try {
      await managementFetch(`organizations/${selectedOrganization}/proxies`, {
        method: 'POST',
        body: JSON.stringify({ name: String(data.get('name')) }),
      });
      form.reset();
      setShowCreate(false);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const synchronizedGateways = runtime?.gateways.filter(gateway => gateway.synchronized).length ?? 0;
  const runtimeTone = !runtime?.redisAvailable
    ? 'warning'
    : runtime.gateways.some(gateway => gateway.state === 'error')
      ? 'error'
      : runtime.gateways.length > 0 && synchronizedGateways === runtime.gateways.length
        ? 'ready'
        : 'pending';

  return (
    <div className="proxy-page">
      <header className="proxy-page-header">
        <div>
          <h1>Proxies</h1>
          <p>Trace logical routes from immutable revisions to their active environments.</p>
        </div>
        <div className="proxy-header-actions">
          <button
            className="icon-command"
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            aria-label="Refresh proxies"
            title="Refresh proxies"
          >
            <RefreshIcon className={isRefreshing ? 'is-spinning' : undefined} />
          </button>
          {writableOrganizations.length > 0 && (
            <button
              className="primary-command"
              type="button"
              onClick={() => setShowCreate(value => !value)}
              aria-expanded={showCreate}
            >
              <PlusIcon />
              Create proxy
            </button>
          )}
        </div>
      </header>

      <section className={`runtime-rail runtime-${runtimeTone}`} aria-live="polite">
        <span className="runtime-node" aria-hidden="true" />
        <div>
          <strong>
            {!runtime
              ? 'Reading runtime state'
              : runtimeTone === 'ready'
                ? 'Runtime synchronized'
                : runtimeTone === 'error'
                  ? 'Runtime needs attention'
                  : runtimeTone === 'warning'
                    ? 'Runtime status unavailable'
                    : 'Configuration applying'}
          </strong>
          <span>
            {runtime
              ? `Version ${runtime.latestVersion} · ${synchronizedGateways}/${runtime.gateways.length} gateways applied · ${runtime.pendingChanges} pending`
              : 'Connecting to the control plane'}
          </span>
        </div>
        {lastUpdated && (
          <time dateTime={lastUpdated.toISOString()}>
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        )}
      </section>

      {showCreate && (
        <section className="proxy-action-sheet" aria-labelledby="create-proxy-title">
          <div>
            <h2 id="create-proxy-title">Create a logical proxy</h2>
            <p>Create the route identity first. Importing a revision does not affect runtime traffic.</p>
          </div>
          <form className="proxy-inline-form" onSubmit={createProxy}>
            <label className="field">
              <span>Organization</span>
              <select name="organizationId" required defaultValue={writableOrganizations[0]?.id}>
                {writableOrganizations.map(organization => (
                  <option value={organization.id} key={organization.id}>{organization.name}</option>
                ))}
              </select>
            </label>
            <label className="field proxy-name-field">
              <span>Proxy name</span>
              <input name="name" required maxLength={120} placeholder="Accounts API" autoFocus />
            </label>
            <div className="inline-form-actions">
              <button className="secondary-command" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="primary-command" disabled={isCreating}>{isCreating ? 'Creating…' : 'Create proxy'}</button>
            </div>
          </form>
        </section>
      )}

      {error && <div className="alert error" role="alert">{error}</div>}

      <ProxyFilterBar
        filters={filters}
        countryOptions={countryOptions}
        stageOptions={stageOptions}
        organizationOptions={organizationOptions}
        stateOptions={stateOptions}
        onCommit={commitFilters}
        onSearchChange={changeSearch}
      />

      <section className="proxy-inventory" aria-labelledby="proxy-inventory-title">
        <header className="proxy-inventory-heading">
          <h2 id="proxy-inventory-title">Proxy inventory</h2>
          <span>{isLoading ? 'Loading' : `${filteredProxies.length} of ${proxies.length}`}</span>
        </header>

        <div className="proxy-list-header" aria-hidden="true">
          <span>Proxy</span><span>Route</span><span>Environments</span><span>Configuration</span><span>State</span><span />
        </div>

        {isLoading ? (
          <div className="proxy-skeleton-list" aria-label="Loading proxies">
            {[0, 1, 2].map(item => <div className="proxy-skeleton" key={item} />)}
          </div>
        ) : filteredProxies.length > 0 ? (
          <div className="proxy-list">
            {filteredProxies.map(proxy => {
              const revision = proxy.revisions[0];
              return (
                <Link className="proxy-row" href={`/proxies/${proxy.id}`} key={proxy.id}>
                  <div className="proxy-cell proxy-identity" data-label="Proxy">
                    <span className="proxy-icon"><ProxyIcon /></span>
                    <span><strong>{proxy.name}</strong><small>{proxy.organization.name}</small><code>{proxy.id}</code></span>
                  </div>
                  <div className="proxy-cell proxy-route" data-label="Route">
                    <strong>{revision?.basePath ?? 'No revision'}</strong>
                    <small>{revision ? `OpenAPI ${revision.openapiVersion} · rev ${revision.revisionNumber}` : 'Import a bundle to define this route'}</small>
                  </div>
                  <div className="proxy-cell" data-label="Environments">
                    <div className="environment-markers">
                      {proxy.deployments.length > 0 ? proxy.deployments.map(deployment => {
                        const environment = environmentMap.get(deployment.environmentId);
                        return environment ? (
                          <span className={`environment-marker stage-${environment.stage}`} key={deployment.id} title={environment.publicOrigin}>
                            {environment.stage}<small>{environment.region}</small>
                          </span>
                        ) : null;
                      }) : <span className="muted-value">Undeployed</span>}
                    </div>
                  </div>
                  <div className="proxy-cell proxy-counts" data-label="Configuration">
                    <span><strong>{proxy._count.revisions}</strong> revisions</span>
                    <span><strong>{proxy._count.products}</strong> products</span>
                  </div>
                  <div className="proxy-cell" data-label="State">
                    <span className={`status ${proxy.systemManaged ? 'status-system' : proxy.active ? 'status-active' : 'status-inactive'}`}>
                      {proxy.systemManaged ? 'system' : proxy.active ? 'active' : 'inactive'}
                    </span>
                  </div>
                  <ArrowIcon className="proxy-row-arrow" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="proxy-empty-state">
            <ProxyIcon />
            <div>
              <h3>{proxies.length === 0 ? 'No proxies yet' : 'No proxies match these filters'}</h3>
              <p>{proxies.length === 0 ? 'Create a logical proxy, then import its first immutable revision.' : 'Adjust the country, stage, organization, state, or search query.'}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
