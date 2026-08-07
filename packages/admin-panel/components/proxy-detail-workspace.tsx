'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  PauseIcon,
  ProxyIcon,
  RefreshIcon,
  UploadIcon,
} from '@/components/gateway-icons';
import { useAdminSession } from '@/components/session-context';
import {
  ManagementApiError,
  managementFetch,
  managementText,
  type ApiProxyDetail,
  type Environment,
  type ProxyDeployment,
  type ProxyRevisionDetail,
  type ProxyRevisionSummary,
  type RuntimeMutationResponse,
  type RuntimeSyncStatus,
} from '@/lib/api-client';
import {
  canManageOrganization,
  environmentLabel,
  isPromotionEligible,
  runtimeHasApplied,
  sortEnvironments,
} from '@/lib/proxy-control';

type ActionMode = 'edit' | 'import' | 'deploy' | null;
type ApplyState = 'idle' | 'queued' | 'applied' | 'delayed' | 'error';

interface ApplyNotice {
  state: ApplyState;
  targetVersion?: number;
  message?: string;
}

export function ProxyDetailWorkspace({
  proxyId,
  created = false,
}: {
  proxyId: string;
  created?: boolean;
}) {
  const session = useAdminSession();
  const [proxy, setProxy] = useState<ApiProxyDetail | null>(null);
  const [revisions, setRevisions] = useState<ProxyRevisionSummary[]>([]);
  const [deployments, setDeployments] = useState<ProxyDeployment[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [runtime, setRuntime] = useState<RuntimeSyncStatus | null>(null);
  const [selectedRevisionNumber, setSelectedRevisionNumber] = useState<number | null>(null);
  const [deployRevisionNumber, setDeployRevisionNumber] = useState<number | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<ProxyRevisionDetail | null>(null);
  const [mode, setMode] = useState<ActionMode>(null);
  const [isLoading, setLoading] = useState(true);
  const [isRevisionLoading, setRevisionLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [applyNotice, setApplyNotice] = useState<ApplyNotice>({ state: 'idle' });
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!quiet) setLoading(true);
    try {
      const [nextProxy, nextRevisions, nextDeployments, nextEnvironments, nextRuntime] = await Promise.all([
        managementFetch<ApiProxyDetail>(`proxies/${proxyId}`, { signal: controller.signal }),
        managementFetch<ProxyRevisionSummary[]>(`proxies/${proxyId}/revisions`, { signal: controller.signal }),
        managementFetch<ProxyDeployment[]>(`proxies/${proxyId}/deployments`, { signal: controller.signal }),
        managementFetch<Environment[]>('environments', { signal: controller.signal }),
        managementFetch<RuntimeSyncStatus>('runtime-sync', { signal: controller.signal }),
      ]);
      setProxy(nextProxy);
      setRevisions(nextRevisions);
      setDeployments(nextDeployments);
      setEnvironments(sortEnvironments(nextEnvironments));
      setRuntime(nextRuntime);
      setSelectedRevisionNumber(current => current ?? nextRevisions[0]?.revisionNumber ?? null);
      setError('');
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') setError((cause as Error).message);
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [proxyId]);

  useEffect(() => {
    void refresh();
    return () => requestRef.current?.abort();
  }, [refresh]);

  useEffect(() => {
    if (selectedRevisionNumber === null) {
      setSelectedRevision(null);
      return;
    }
    const controller = new AbortController();
    setRevisionLoading(true);
    managementFetch<ProxyRevisionDetail>(
      `proxies/${proxyId}/revisions/${selectedRevisionNumber}`,
      { signal: controller.signal },
    )
      .then(setSelectedRevision)
      .catch(cause => {
        if ((cause as Error).name !== 'AbortError') setError((cause as Error).message);
      })
      .finally(() => setRevisionLoading(false));
    return () => controller.abort();
  }, [proxyId, selectedRevisionNumber]);

  const canManage = proxy ? canManageOrganization(session, proxy.organizationId) && !proxy.systemManaged : false;
  const activeDeployments = useMemo(
    () => deployments.filter(deployment => deployment.status === 'active'),
    [deployments],
  );
  const environmentsByRegion = useMemo(() => {
    const grouped = new Map<string, Environment[]>();
    for (const environment of environments) {
      grouped.set(environment.region, [...(grouped.get(environment.region) ?? []), environment]);
    }
    return [...grouped.entries()];
  }, [environments]);

  async function pollRuntime(targetVersion: number) {
    setApplyNotice({ state: 'queued', targetVersion });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 1_000));
      try {
        const nextRuntime = await managementFetch<RuntimeSyncStatus>('runtime-sync');
        setRuntime(nextRuntime);
        const failedGateway = nextRuntime.gateways.find(gateway => gateway.state === 'error');
        if (failedGateway) {
          setApplyNotice({
            state: 'error',
            targetVersion,
            message: failedGateway.lastError ?? `${failedGateway.instanceId} could not apply the configuration.`,
          });
          return;
        }
        if (runtimeHasApplied(nextRuntime, targetVersion)) {
          setApplyNotice({ state: 'applied', targetVersion });
          await refresh(true);
          return;
        }
      } catch (cause) {
        setApplyNotice({ state: 'error', targetVersion, message: (cause as Error).message });
        return;
      }
    }
    setApplyNotice({
      state: 'delayed',
      targetVersion,
      message: 'The change is committed, but not every gateway has reported it applied.',
    });
  }

  async function pollForVersionAfter(baseline: number) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextRuntime = await managementFetch<RuntimeSyncStatus>('runtime-sync');
      setRuntime(nextRuntime);
      if (nextRuntime.latestVersion > baseline) {
        await pollRuntime(nextRuntime.latestVersion);
        return;
      }
      await new Promise(resolve => window.setTimeout(resolve, 500));
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proxy) return;
    const data = new FormData(event.currentTarget);
    const active = data.get('active') === 'on';
    const activeChanged = active !== proxy.active;
    const baselineVersion = runtime?.latestVersion ?? 0;
    setBusy(true);
    setError('');
    try {
      await managementFetch(`proxies/${proxy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: String(data.get('name')), active }),
      });
      setMode(null);
      setNotice('Proxy settings saved.');
      await refresh(true);
      if (activeChanged) await pollForVersionAfter(baselineVersion);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proxy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const revision = await managementFetch<ProxyRevisionDetail>(
        `proxies/${proxy.id}/revisions`,
        { method: 'POST', body: data },
      );
      setMode(null);
      setNotice(revision.warnings?.length
        ? `Revision ${revision.revisionNumber} imported with ${revision.warnings.length} warning${revision.warnings.length === 1 ? '' : 's'}.`
        : `Revision ${revision.revisionNumber} imported. Runtime traffic is unchanged until deployment.`);
      setSelectedRevisionNumber(revision.revisionNumber);
      await refresh(true);
    } catch (cause) {
      setError(describeManagementError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proxy) return;
    const data = new FormData(event.currentTarget);
    const revisionNumber = Number(data.get('revisionNumber'));
    const environmentId = String(data.get('environmentId'));
    const upstreamBaseUrl = String(data.get('upstreamBaseUrl')).trim();
    setBusy(true);
    setError('');
    try {
      const result = await managementFetch<RuntimeMutationResponse>(
        `proxies/${proxy.id}/revisions/${revisionNumber}/deployments`,
        {
          method: 'POST',
          body: JSON.stringify({
            environmentId,
            upstreamBaseUrl: upstreamBaseUrl || null,
          }),
        },
      );
      setMode(null);
      setNotice(`Revision ${revisionNumber} committed to ${environmentLabel(result.deployment.environment)}.`);
      await refresh(true);
      void pollRuntime(result.runtimeSync.version);
    } catch (cause) {
      setError(describeManagementError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function retireDeployment(deployment: ProxyDeployment) {
    if (!window.confirm(`Retire revision ${deployment.revision.revisionNumber} from ${environmentLabel(deployment.environment)}? Traffic for this route will stop in that environment.`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await managementFetch<RuntimeMutationResponse>(
        `proxy-deployments/${deployment.id}/retire`,
        { method: 'POST' },
      );
      setNotice(`Deployment retired from ${environmentLabel(deployment.environment)}.`);
      await refresh(true);
      void pollRuntime(result.runtimeSync.version);
    } catch (cause) {
      setError(describeManagementError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function downloadSource(source: 'openapi' | 'gateway-config') {
    if (selectedRevisionNumber === null || !proxy) return;
    try {
      const result = await managementText(`proxies/${proxy.id}/revisions/${selectedRevisionNumber}/${source}`);
      const extension = result.contentType.includes('json') ? 'json' : 'yaml';
      const blob = new Blob([result.content], { type: result.contentType });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${proxy.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-r${selectedRevisionNumber}-${source}.${extension}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  if (isLoading && !proxy) {
    return <div className="proxy-detail-loading" aria-label="Loading proxy"><div /><div /><div /></div>;
  }

  if (!proxy) {
    return (
      <div className="proxy-detail-missing">
        <ProxyIcon />
        <h1>Proxy unavailable</h1>
        <p>{error || 'This proxy does not exist or is outside your organization access.'}</p>
        <Link className="secondary-command" href="/proxies">Return to proxies</Link>
      </div>
    );
  }

  return (
    <div className="proxy-detail-page">
      <nav className="detail-breadcrumb" aria-label="Breadcrumb">
        <Link href="/proxies">Proxies</Link><ArrowIcon /><span>{proxy.name}</span>
      </nav>

      <header className="proxy-detail-header">
        <div>
          <div className="proxy-title-line">
            <h1>{proxy.name}</h1>
            <span className={`status ${proxy.systemManaged ? 'status-system' : proxy.active ? 'status-active' : 'status-inactive'}`}>
              {proxy.systemManaged ? 'system' : proxy.active ? 'active' : 'inactive'}
            </span>
          </div>
          <p>{proxy.organization.name} · <code>{proxy.id}</code></p>
        </div>
        <div className="proxy-header-actions">
          <button className="icon-command" type="button" onClick={() => void refresh()} title="Refresh proxy" aria-label="Refresh proxy"><RefreshIcon /></button>
          {canManage && (
            <>
              <button className="secondary-command" type="button" onClick={() => setMode('edit')}><EditIcon />Settings</button>
              <button className="primary-command" type="button" onClick={() => setMode('import')}><UploadIcon />Import revision</button>
            </>
          )}
        </div>
      </header>

      {proxy.systemManaged && (
        <div className="system-proxy-note">This route is managed by the platform and is available for inspection only.</div>
      )}
      {created && (
        <section className="created-proxy-notice" aria-live="polite">
          <div>
            <strong>Proxy created with revision 1.</strong>
            <span>No environments are deployed.</span>
          </div>
          {canManage && revisions.length > 0 && (
            <button
              className="secondary-command"
              type="button"
              onClick={() => {
                setDeployRevisionNumber(1);
                setMode('deploy');
              }}
            >
              <ArrowIcon />Deploy to QUAL
            </button>
          )}
        </section>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}

      {applyNotice.state !== 'idle' && (
        <section className={`apply-notice apply-${applyNotice.state}`} aria-live="polite">
          <span className="runtime-node" />
          <div>
            <strong>{applyNotice.state === 'applied' ? 'Applied to every gateway' : applyNotice.state === 'error' ? 'Gateway rejected the change' : applyNotice.state === 'delayed' ? 'Application delayed' : 'Applying configuration'}</strong>
            <span>{applyNotice.message ?? `Tracking configuration version ${applyNotice.targetVersion}.`}</span>
          </div>
          {(applyNotice.state === 'delayed' || applyNotice.state === 'error') && (
            <button className="secondary-command" type="button" onClick={() => applyNotice.targetVersion && void pollRuntime(applyNotice.targetVersion)}>Check again</button>
          )}
        </section>
      )}

      {mode && (
        <section className="proxy-action-sheet detail-action-sheet">
          {mode === 'edit' && (
            <>
              <div><h2>Proxy settings</h2><p>Renaming changes control-plane labels. Activation changes the live routing registry.</p></div>
              <form className="proxy-inline-form" onSubmit={submitEdit}>
                <label className="field proxy-name-field"><span>Name</span><input name="name" defaultValue={proxy.name} maxLength={120} required autoFocus /></label>
                <label className="toggle-field"><input type="checkbox" name="active" defaultChecked={proxy.active} /><span><strong>Active route</strong><small>Include this proxy in runtime configuration.</small></span></label>
                <InlineActions onCancel={() => setMode(null)} busy={busy} label="Save settings" />
              </form>
            </>
          )}
          {mode === 'import' && (
            <>
              <div><h2>Import an immutable revision</h2><p>Both files are compiled together. Each file may be up to 5 MiB.</p></div>
              <form className="proxy-file-form" onSubmit={submitImport}>
                <label className="file-field"><span>OpenAPI document</span><small>OpenAPI 3.0 or 3.1 · YAML or JSON</small><input name="openapi" type="file" accept=".yaml,.yml,.json,application/yaml,application/json" required /></label>
                <label className="file-field"><span>Gateway configuration</span><small>gateway.platform/v1 · YAML</small><input name="gateway" type="file" accept=".yaml,.yml,application/yaml" required /></label>
                <InlineActions onCancel={() => setMode(null)} busy={busy} label="Import revision" />
              </form>
            </>
          )}
          {mode === 'deploy' && (
            <>
              <div><h2>Deploy a revision</h2><p>Deploying an earlier revision is a rollback. Promotion follows QUAL → PPROD → PROD in each region.</p></div>
              <form className="proxy-inline-form deploy-form" onSubmit={submitDeployment}>
                <label className="field"><span>Revision</span><select name="revisionNumber" required value={deployRevisionNumber ?? selectedRevisionNumber ?? revisions[0]?.revisionNumber} onChange={event => setDeployRevisionNumber(Number(event.target.value))}>{revisions.map(revision => <option key={revision.id} value={revision.revisionNumber}>Revision {revision.revisionNumber} · {revision.basePath}</option>)}</select></label>
                <label className="field"><span>Environment</span><select name="environmentId" required>{environments.map(environment => { const revisionNumber = deployRevisionNumber ?? selectedRevisionNumber ?? revisions[0]?.revisionNumber; const eligible = revisionNumber !== undefined && isPromotionEligible(environment, revisionNumber, deployments); return <option key={environment.id} value={environment.id} disabled={!eligible}>{environmentLabel(environment)}{!eligible ? ' · promote first' : ''}</option>; })}</select></label>
                <label className="field proxy-upstream-field"><span>Upstream base URL</span><input name="upstreamBaseUrl" type="url" placeholder="https://service.internal" /></label>
                <InlineActions onCancel={() => setMode(null)} busy={busy} label="Deploy revision" />
              </form>
            </>
          )}
        </section>
      )}

      <section className="proxy-facts" aria-label="Proxy facts">
        <div><span>Latest revision</span><strong>{revisions[0]?.revisionNumber ?? '—'}</strong></div>
        <div><span>Base path</span><strong>{revisions[0]?.basePath ?? 'Not defined'}</strong></div>
        <div><span>Active environments</span><strong>{activeDeployments.length}</strong></div>
        <div><span>API products</span><strong>{proxy.products.length}</strong></div>
      </section>

      <section className="deployment-section" aria-labelledby="deployment-title">
        <header className="section-heading-row">
          <div><h2 id="deployment-title">Deployment path</h2><p>One active revision per proxy and environment; retired rows remain as history.</p></div>
          {canManage && revisions.length > 0 && <button className="secondary-command" type="button" onClick={() => { setDeployRevisionNumber(selectedRevisionNumber ?? revisions[0].revisionNumber); setMode('deploy'); }}><ArrowIcon />Deploy</button>}
        </header>
        <div className="deployment-topology">
          {environmentsByRegion.map(([region, regionEnvironments]) => (
            <div className="deployment-region" key={region}>
              <h3>{region.toUpperCase()}</h3>
              <div className="deployment-route">
                {regionEnvironments.map((environment, index) => {
                  const deployment = activeDeployments.find(item => item.environmentId === environment.id);
                  return (
                    <div className={`deployment-stop ${deployment ? 'is-deployed' : ''}`} key={environment.id}>
                      <div className="deployment-track"><span className="deployment-node" />{index < regionEnvironments.length - 1 && <span className="deployment-line" />}</div>
                      <strong>{environment.stage.toUpperCase()}</strong>
                      {deployment ? (
                        <>
                          <span>Revision {deployment.revision.revisionNumber}</span>
                          <a href={environment.publicOrigin} target="_blank" rel="noreferrer">{environment.publicOrigin}</a>
                          {canManage && <button type="button" onClick={() => void retireDeployment(deployment)} disabled={busy}><PauseIcon />Retire</button>}
                        </>
                      ) : <span className="muted-value">Not deployed</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {environmentsByRegion.length === 0 && <div className="empty-state">No environments are configured.</div>}
        </div>
      </section>

      <section className="revision-section" aria-labelledby="revision-title">
        <header className="section-heading-row"><div><h2 id="revision-title">Immutable revisions</h2><p>Select a revision to inspect its routes, policies, and original sources.</p></div></header>
        {revisions.length > 0 ? (
          <div className="revision-workspace">
            <div className="revision-index" aria-label="Proxy revisions">
              {revisions.map(revision => (
                <button
                  key={revision.id}
                  type="button"
                  aria-pressed={selectedRevisionNumber === revision.revisionNumber}
                  onClick={() => setSelectedRevisionNumber(revision.revisionNumber)}
                >
                  <span><strong>Revision {revision.revisionNumber}</strong><small>{new Date(revision.createdAt).toLocaleDateString()}</small></span>
                  <span><code>{revision.basePath}</code><small>{revision._count?.operations ?? '—'} operations · {revision._count?.deployments ?? '—'} deployments</small></span>
                  <ArrowIcon />
                </button>
              ))}
            </div>
            <div className="revision-detail">
              {isRevisionLoading ? <div className="revision-loading">Loading revision…</div> : selectedRevision ? (
                <>
                  <header className="revision-detail-header">
                    <div><h3>Revision {selectedRevision.revisionNumber}</h3><p>OpenAPI {selectedRevision.openapiVersion} · <code>{selectedRevision.contentHash.slice(0, 16)}</code></p></div>
                    <div>
                      <button className="secondary-command" type="button" onClick={() => void navigator.clipboard.writeText(selectedRevision.contentHash)} title="Copy content hash"><CopyIcon />Hash</button>
                      <button className="secondary-command" type="button" onClick={() => void downloadSource('openapi')}><DownloadIcon />OpenAPI</button>
                      <button className="secondary-command" type="button" onClick={() => void downloadSource('gateway-config')}><DownloadIcon />Gateway YAML</button>
                    </div>
                  </header>
                  <div className="operation-list">
                    {selectedRevision.operations.map(operation => (
                      <details className="operation-row" key={operation.id}>
                        <summary>
                          <span className={`method method-${operation.method.toLowerCase()}`}>{operation.method}</span>
                          <code>{operation.path}</code>
                          <span>{operation.operationId}</span>
                          <span>{operation.mode}</span>
                          <span>{operation.policies.length} policies</span>
                        </summary>
                        <div className="operation-detail">
                          <dl><div><dt>Target path</dt><dd>{operation.targetPath ?? 'Preserve incoming path'}</dd></div><div><dt>Mode</dt><dd>{operation.mode}</dd></div></dl>
                          <ol className="policy-pipeline">
                            {operation.policies.map(policy => (
                              <li key={policy.id} className={policy.enabled ? '' : 'is-disabled'}>
                                <span>{policy.order}</span>
                                <div><strong>{policy.type}</strong><small>{policy.enabled ? 'Enabled' : 'Disabled'}</small></div>
                                <pre>{JSON.stringify(policy.config, null, 2)}</pre>
                              </li>
                            ))}
                            {operation.policies.length === 0 && <li className="policy-empty">No policies configured for this operation.</li>}
                          </ol>
                        </div>
                      </details>
                    ))}
                  </div>
                </>
              ) : <div className="empty-state">Select a revision.</div>}
            </div>
          </div>
        ) : (
          <div className="proxy-empty-state"><UploadIcon /><div><h3>No revisions imported</h3><p>Import OpenAPI and Gateway YAML files to compile the first immutable route configuration.</p></div></div>
        )}
      </section>

      <section className="deployment-history-section" aria-labelledby="history-title">
        <header className="section-heading-row"><div><h2 id="history-title">Deployment history</h2><p>Every replacement and retirement remains available for audit and rollback decisions.</p></div></header>
        <div className="deployment-history table-wrap">
          <table>
            <thead><tr><th>Environment</th><th>Revision</th><th>Upstream</th><th>Created</th><th>Status</th></tr></thead>
            <tbody>{deployments.map(deployment => <tr key={deployment.id}><td><strong>{environmentLabel(deployment.environment)}</strong><code>{deployment.environment.publicOrigin}</code></td><td>Revision {deployment.revision.revisionNumber}<code>{deployment.revision.contentHash.slice(0, 12)}</code></td><td><code>{deployment.upstreamBaseUrl ?? 'Local response'}</code></td><td>{new Date(deployment.createdAt).toLocaleString()}</td><td><span className={`status status-${deployment.status}`}>{deployment.status}</span></td></tr>)}</tbody>
          </table>
          {deployments.length === 0 && <div className="empty-state">No deployment history.</div>}
        </div>
      </section>

      <section className="proxy-products-section" aria-labelledby="products-title">
        <header className="section-heading-row"><div><h2 id="products-title">API-product exposure</h2><p>Products define which applications and scopes can consume this proxy.</p></div></header>
        <div className="product-lines">
          {proxy.products.map(product => <Link href="/products" key={product.id}><span><strong>{product.name}</strong><small>{product.scopes.join(', ') || 'No scopes'}</small></span><span className={`status status-${product.active ? 'active' : 'inactive'}`}>{product.active ? 'active' : 'inactive'}</span><ArrowIcon /></Link>)}
          {proxy.products.length === 0 && <div className="empty-state">This proxy is not connected to an API product.</div>}
        </div>
      </section>
    </div>
  );
}

function InlineActions({
  onCancel,
  busy,
  label,
}: {
  onCancel: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <div className="inline-form-actions">
      <button className="secondary-command" type="button" onClick={onCancel}>Cancel</button>
      <button className="primary-command" disabled={busy}>{busy ? 'Working…' : label}</button>
    </div>
  );
}

function describeManagementError(cause: unknown): string {
  if (!(cause instanceof ManagementApiError)) return (cause as Error).message;
  const guidance: Record<string, string> = {
    promotion_required: 'Deploy this exact revision to the previous stage in the same region first.',
    deployment_conflict: 'Another active proxy already owns this base path in the selected environment.',
    upstream_required: 'Provide a valid HTTP or HTTPS upstream for this forwarding revision.',
    invalid_openapi: 'The OpenAPI document could not be compiled. Check its version and operation IDs.',
    invalid_gateway_config: 'The Gateway YAML is invalid or does not match the OpenAPI operations.',
    policy_not_supported: 'The bundle references a policy type that this runtime does not support.',
  };
  return guidance[cause.code ?? ''] ?? cause.message;
}
