'use client';

import {
  Box,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  LoaderCircle,
  Route,
  Search,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  ApiProxyDetail,
  ApiProxySummary,
  ProxyDeployment,
  ProxyRevisionDetail,
  ProxyRevisionSummary,
} from '@/lib/api-client';
import { labFetch } from '@/lib/lab-api';

interface LabUpstreamSummary {
  id: string;
  name: string;
  kind: 'mock' | 'publicHttps';
  active: boolean;
}

interface LabProxyInspectorProps {
  hostname: string;
  proxies: ApiProxySummary[];
  upstreams: LabUpstreamSummary[];
}

function deployedOrigin(hostname: string, deployment: ProxyDeployment): string {
  const origin = new URL(deployment.environment.publicOrigin);
  origin.hostname = hostname;
  return origin.origin;
}

function deployedRoute(
  hostname: string,
  deployment: ProxyDeployment,
): string {
  return new URL(deployment.revision.basePath, deployedOrigin(hostname, deployment)).toString();
}

function upstreamId(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\/upstreams\/([^/?#]+)/u);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function configurationSummary(config: Record<string, unknown>): string {
  const entries = Object.entries(config);
  if (entries.length === 0) return 'Default configuration';
  return entries.map(([name, value]) => {
    const formatted = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);
    return `${name}: ${formatted}`;
  }).join(' · ');
}

export function LabProxyInspector({
  hostname,
  proxies,
  upstreams,
}: LabProxyInspectorProps) {
  const [query, setQuery] = useState('');
  const [selectedProxyId, setSelectedProxyId] = useState(proxies[0]?.id ?? '');
  const [proxy, setProxy] = useState<ApiProxyDetail | null>(null);
  const [revisions, setRevisions] = useState<ProxyRevisionSummary[]>([]);
  const [deployments, setDeployments] = useState<ProxyDeployment[]>([]);
  const [selectedRevisionNumber, setSelectedRevisionNumber] = useState<number | null>(null);
  const [revision, setRevision] = useState<ProxyRevisionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredProxies = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return proxies;
    return proxies.filter(candidate => {
      const route = candidate.revisions[0]?.basePath ?? '';
      return candidate.name.toLowerCase().includes(normalized)
        || route.toLowerCase().includes(normalized)
        || candidate.id.toLowerCase().includes(normalized);
    });
  }, [proxies, query]);

  useEffect(() => {
    if (!proxies.some(candidate => candidate.id === selectedProxyId)) {
      setSelectedProxyId(proxies[0]?.id ?? '');
    }
  }, [proxies, selectedProxyId]);

  useEffect(() => {
    if (!selectedProxyId) {
      setProxy(null);
      setRevisions([]);
      setDeployments([]);
      setSelectedRevisionNumber(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([
      labFetch<ApiProxyDetail>(`proxies/${selectedProxyId}`),
      labFetch<ProxyRevisionSummary[]>(`proxies/${selectedProxyId}/revisions`),
      labFetch<ProxyDeployment[]>(`proxies/${selectedProxyId}/deployments`),
    ]).then(([nextProxy, nextRevisions, nextDeployments]) => {
      if (!active) return;
      setProxy(nextProxy);
      setRevisions(nextRevisions);
      setDeployments(nextDeployments);
      const activeRevision = nextDeployments.find(item => item.status === 'active')
        ?.revision.revisionNumber;
      setSelectedRevisionNumber(current =>
        current && nextRevisions.some(item => item.revisionNumber === current)
          ? current
          : activeRevision ?? nextRevisions[0]?.revisionNumber ?? null);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Lab proxy could not be loaded');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [proxies, selectedProxyId]);

  useEffect(() => {
    if (!selectedProxyId || selectedRevisionNumber === null) {
      setRevision(null);
      return;
    }
    let active = true;
    setRevisionLoading(true);
    void labFetch<ProxyRevisionDetail>(
      `proxies/${selectedProxyId}/revisions/${selectedRevisionNumber}`,
    ).then(value => {
      if (active) setRevision(value);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Lab revision could not be loaded');
    }).finally(() => {
      if (active) setRevisionLoading(false);
    });
    return () => { active = false; };
  }, [selectedProxyId, selectedRevisionNumber]);

  const activeDeployments = deployments.filter(item => item.status === 'active');
  const totalActiveDeployments = proxies.reduce(
    (total, candidate) => total + candidate.deployments.filter(item => item.status === 'active').length,
    0,
  );
  const upstreamMap = useMemo(
    () => new Map(upstreams.map(item => [item.id, item])),
    [upstreams],
  );

  if (proxies.length === 0) return null;

  return (
    <section className="lab-proxy-inspector" aria-labelledby="lab-proxy-inspector-title">
      <header className="lab-section-header">
        <div>
          <span className="section-kicker">Deployed configuration</span>
          <h2 id="lab-proxy-inspector-title">Inspect lab proxies</h2>
        </div>
        <span>{totalActiveDeployments} active deployment{totalActiveDeployments === 1 ? '' : 's'}</span>
      </header>

      <div className="lab-proxy-inspector-grid">
        <aside className="lab-proxy-register" aria-label="Lab proxy inventory">
          <label className="lab-proxy-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search lab proxies</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search proxies or paths"
            />
          </label>
          <div className="lab-proxy-register-count">
            <span>Proxy inventory</span>
            <strong>{filteredProxies.length}/{proxies.length}</strong>
          </div>
          <div className="lab-proxy-register-list">
            {filteredProxies.map(candidate => {
              const activeCount = candidate.deployments.filter(item => item.status === 'active').length;
              return (
                <button
                  type="button"
                  key={candidate.id}
                  className={selectedProxyId === candidate.id ? 'is-selected' : undefined}
                  aria-pressed={selectedProxyId === candidate.id}
                  onClick={() => setSelectedProxyId(candidate.id)}
                >
                  <span><Route /><strong>{candidate.name}</strong></span>
                  <code>{candidate.revisions[0]?.basePath ?? 'No revision'}</code>
                  <small>{candidate._count.revisions} revisions · {activeCount} active</small>
                  <ChevronRight aria-hidden="true" />
                </button>
              );
            })}
            {filteredProxies.length === 0 && (
              <div className="lab-proxy-register-empty">No proxies match this search.</div>
            )}
          </div>
        </aside>

        <div className="lab-proxy-evidence">
          {loading && !proxy ? (
            <div className="lab-proxy-loading"><LoaderCircle className="is-spinning" /> Loading proxy configuration</div>
          ) : error && !proxy ? (
            <div className="alert error" role="alert">{error}</div>
          ) : proxy ? (
            <>
              <header className="lab-proxy-evidence-header">
                <div>
                  <span className={`status ${proxy.active ? 'status-active' : 'status-inactive'}`}>
                    {proxy.active ? 'active' : 'inactive'}
                  </span>
                  <h3>{proxy.name}</h3>
                  <code>{proxy.id}</code>
                </div>
                <dl>
                  <div><dt>Revisions</dt><dd>{proxy._count.revisions}</dd></div>
                  <div><dt>Products</dt><dd>{proxy.products.length}</dd></div>
                  <div><dt>Deployments</dt><dd>{activeDeployments.length}</dd></div>
                </dl>
              </header>

              {error && <div className="alert error" role="alert">{error}</div>}

              <section className="lab-deployment-evidence" aria-labelledby="lab-deployments-title">
                <header><Server /><div><h4 id="lab-deployments-title">Active deployments</h4><p>The routes currently loaded by the workspace runtime.</p></div></header>
                {activeDeployments.length > 0 ? activeDeployments.map(deployment => {
                  const selectedUpstream = upstreamMap.get(upstreamId(deployment.upstreamBaseUrl) ?? '');
                  return (
                    <div className="lab-deployment-row" key={deployment.id}>
                      <span className="lab-runtime-node" aria-hidden="true" />
                      <div><strong>{deployment.environment.region.toUpperCase()} · {deployment.environment.stage.toUpperCase()}</strong><code>{deployedRoute(hostname, deployment)}</code></div>
                      <div><span>Revision {deployment.revision.revisionNumber}</span><small>{selectedUpstream ? `${selectedUpstream.name} · ${selectedUpstream.kind}` : deployment.upstreamBaseUrl ?? 'Local operation'}</small></div>
                    </div>
                  );
                }) : <p className="lab-proxy-empty-value">This proxy has no active deployment.</p>}
              </section>

              <section className="lab-product-evidence" aria-labelledby="lab-products-title">
                <header><Box /><div><h4 id="lab-products-title">Product exposure</h4><p>Products and scopes that can authorize this logical proxy.</p></div></header>
                <div>
                  {proxy.products.length > 0 ? proxy.products.map(product => (
                    <span key={product.id}><strong>{product.name}</strong><code>{product.scopes.join(', ') || 'No scopes'}</code></span>
                  )) : <p className="lab-proxy-empty-value">No product currently contains this proxy.</p>}
                </div>
              </section>

              <section className="lab-revision-evidence" aria-labelledby="lab-revisions-title">
                <header><GitBranch /><div><h4 id="lab-revisions-title">Immutable revision</h4><p>Inspect routing and the ordered policy pipeline.</p></div></header>
                <div className="lab-revision-tabs" role="tablist" aria-label="Lab proxy revisions">
                  {revisions.map(item => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selectedRevisionNumber === item.revisionNumber}
                      key={item.id}
                      onClick={() => setSelectedRevisionNumber(item.revisionNumber)}
                    >
                      Revision {item.revisionNumber}
                      {activeDeployments.some(deployment => deployment.revision.revisionNumber === item.revisionNumber) && <CheckCircle2 aria-label="Deployed" />}
                    </button>
                  ))}
                </div>

                {revisionLoading ? (
                  <div className="lab-proxy-loading"><LoaderCircle className="is-spinning" /> Loading revision</div>
                ) : revision ? (
                  <div className="lab-revision-detail">
                    <dl>
                      <div><dt>Base path</dt><dd><code>{revision.basePath}</code></dd></div>
                      <div><dt>OpenAPI</dt><dd>{revision.openapiVersion}</dd></div>
                      <div><dt>Content hash</dt><dd><code>{revision.contentHash.slice(0, 20)}</code></dd></div>
                      <div><dt>Operations</dt><dd>{revision.operations.length}</dd></div>
                    </dl>
                    <div className="lab-operation-evidence-list">
                      {revision.operations.map(operation => (
                        <article key={operation.id}>
                          <header>
                            <span>{operation.method.toUpperCase()}</span>
                            <div><strong>{operation.path}</strong><code>{operation.operationId}</code></div>
                            <small>{operation.mode}</small>
                          </header>
                          <div className="lab-operation-target"><Route /><span>Target</span><code>{operation.targetPath ?? operation.path}</code></div>
                          <ol>
                            {[...operation.policies].sort((left, right) => left.order - right.order).map(policy => (
                              <li key={policy.id} data-enabled={policy.enabled}>
                                <span><ShieldCheck /></span>
                                <div><strong>{policy.order + 1}. {policy.type}</strong><small>{configurationSummary(policy.config)}</small></div>
                                <code>{policy.enabled ? 'enabled' : 'disabled'}</code>
                              </li>
                            ))}
                            {operation.policies.length === 0 && <li className="lab-policy-empty">No policies configured.</li>}
                          </ol>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : <p className="lab-proxy-empty-value">No revision selected.</p>}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
