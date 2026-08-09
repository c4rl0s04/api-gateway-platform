'use client';

import {
  Activity,
  AppWindow,
  Boxes,
  Cloud,
  FileUp,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Route,
  Server,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { labFetch } from '@/lib/lab-api';

interface LabProxyResource { id: string; name: string; active: boolean }
interface LabProductResource { id: string; name: string; scopes: string[]; active: boolean }
interface LabCredentialResource { id: string; consumerKey: string; status: string }
interface LabAppResource { id: string; name: string; credentials: LabCredentialResource[] }
interface LabUpstreamResource { id: string; name: string; kind: 'mock' | 'publicHttps'; active: boolean }

interface LabAdvancedWorkspaceProps {
  proxies: LabProxyResource[];
  products: LabProductResource[];
  applications: LabAppResource[];
  upstreams: LabUpstreamResource[];
  onChanged(): Promise<void>;
  onConsumerSecret(secret: string): void;
}

interface EnvironmentOption {
  id: string;
  stage: 'qual';
  region: string;
}

interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

function scopes(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/u).map(item => item.trim()).filter(Boolean))];
}

export function LabAdvancedWorkspace({
  proxies,
  products,
  applications,
  upstreams,
  onChanged,
  onConsumerSecret,
}: LabAdvancedWorkspaceProps) {
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [upstreamKind, setUpstreamKind] = useState<'mock' | 'publicHttps'>('mock');
  const [upstreamName, setUpstreamName] = useState('');
  const [upstreamUrl, setUpstreamUrl] = useState('https://');
  const [mockPath, setMockPath] = useState('/example');
  const [mockBody, setMockBody] = useState('{\n  "ok": true\n}');
  const [proxyName, setProxyName] = useState('');
  const [openapiFile, setOpenapiFile] = useState<File | null>(null);
  const [gatewayFile, setGatewayFile] = useState<File | null>(null);
  const [deploymentUpstreamId, setDeploymentUpstreamId] = useState('');
  const [deploymentEnvironmentId, setDeploymentEnvironmentId] = useState('');
  const [productName, setProductName] = useState('');
  const [productScopes, setProductScopes] = useState('example:read');
  const [productProxyId, setProductProxyId] = useState('');
  const [appName, setAppName] = useState('');
  const [appProductId, setAppProductId] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [consumerKey, setConsumerKey] = useState('');

  const credentials = useMemo(
    () => applications.flatMap(application => application.credentials.map(credential => ({
      ...credential,
      appName: application.name,
    }))),
    [applications],
  );

  const loadAudit = useCallback(async () => {
    const response = await labFetch<{ items: AuditEvent[] } | AuditEvent[]>('audit-events?limit=20');
    setAuditEvents(Array.isArray(response) ? response : response.items);
  }, []);

  useEffect(() => {
    void Promise.all([
      labFetch<EnvironmentOption[]>('environments').then(setEnvironments),
      loadAudit(),
    ]).catch(() => undefined);
  }, [loadAudit]);

  useEffect(() => {
    if (!upstreams.some(item => item.id === deploymentUpstreamId)) setDeploymentUpstreamId(upstreams[0]?.id ?? '');
    if (!environments.some(item => item.id === deploymentEnvironmentId)) setDeploymentEnvironmentId(environments[0]?.id ?? '');
    if (!proxies.some(item => item.id === productProxyId)) setProductProxyId(proxies[0]?.id ?? '');
    if (!products.some(item => item.id === appProductId)) setAppProductId(products[0]?.id ?? '');
    if (!credentials.some(item => item.id === credentialId)) {
      setCredentialId(credentials[0]?.id ?? '');
      setConsumerKey(credentials[0]?.consumerKey ?? '');
    }
  }, [appProductId, credentialId, credentials, deploymentEnvironmentId, deploymentUpstreamId, environments, productProxyId, products, proxies, upstreams]);

  const perform = useCallback(async (name: string, operation: () => Promise<void>) => {
    setBusy(name);
    setError('');
    setMessage('');
    try {
      await operation();
      await Promise.all([onChanged(), loadAudit()]);
      setMessage(`${name} completed`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${name} failed`);
    } finally {
      setBusy('');
    }
  }, [loadAudit, onChanged]);

  const createUpstream = (event: FormEvent) => {
    event.preventDefault();
    void perform('Upstream creation', async () => {
      const payload = upstreamKind === 'publicHttps'
        ? { name: upstreamName, kind: upstreamKind, baseUrl: upstreamUrl }
        : {
            name: upstreamName,
            kind: upstreamKind,
            routes: [{
              method: 'GET',
              path: mockPath,
              status: 200,
              headers: { 'content-type': 'application/json' },
              body: JSON.parse(mockBody) as unknown,
            }],
          };
      await labFetch('upstreams', { method: 'POST', body: JSON.stringify(payload) });
      setUpstreamName('');
    });
  };

  const importAndDeploy = (event: FormEvent) => {
    event.preventDefault();
    if (!openapiFile || !gatewayFile) return;
    void perform('Proxy import and deployment', async () => {
      const form = new FormData();
      form.set('name', proxyName);
      form.set('openapi', openapiFile);
      form.set('gateway', gatewayFile);
      const configured = await labFetch<{
        proxy: { id: string };
        revision: { revisionNumber: number };
      }>('proxies/configured', { method: 'POST', body: form });
      await labFetch(
        `proxies/${configured.proxy.id}/revisions/${configured.revision.revisionNumber}/deployments`,
        {
          method: 'POST',
          body: JSON.stringify({
            environmentId: deploymentEnvironmentId,
            upstreamId: deploymentUpstreamId,
          }),
        },
      );
      setProxyName('');
      setOpenapiFile(null);
      setGatewayFile(null);
    });
  };

  const createProduct = (event: FormEvent) => {
    event.preventDefault();
    void perform('Product creation', async () => {
      await labFetch('products', {
        method: 'POST',
        body: JSON.stringify({
          name: productName,
          scopes: scopes(productScopes),
          proxyIds: [productProxyId],
          environmentIds: [deploymentEnvironmentId],
          active: true,
        }),
      });
      setProductName('');
    });
  };

  const createApp = (event: FormEvent) => {
    event.preventDefault();
    void perform('Application creation', async () => {
      const product = products.find(item => item.id === appProductId);
      const created = await labFetch<{ consumerSecret: string }>('apps', {
        method: 'POST',
        body: JSON.stringify({
          name: appName,
          products: [{ productId: appProductId, scopes: product?.scopes ?? [] }],
        }),
      });
      onConsumerSecret(created.consumerSecret);
      setAppName('');
    });
  };

  const updateConsumerKey = (event: FormEvent) => {
    event.preventDefault();
    void perform('Consumer key update', async () => {
      await labFetch(`credentials/${credentialId}`, {
        method: 'PATCH',
        body: JSON.stringify({ consumerKey }),
      });
    });
  };

  const rotateSecret = () => void perform('Consumer secret rotation', async () => {
    const rotated = await labFetch<{ consumerSecret: string }>(
      `credentials/${credentialId}/rotate-secret`,
      { method: 'POST', body: '{}' },
    );
    onConsumerSecret(rotated.consumerSecret);
  });

  return (
    <section className="lab-advanced">
      <header className="lab-section-header">
        <div><span className="section-kicker">Advanced workspace</span><h2>Create the complete gateway chain</h2></div>
        <span>{proxies.length} proxies · {products.length} products · {applications.length} apps</span>
      </header>
      <p className="lab-advanced-intro">These operations use the isolated Lab API. Identifiers for the hidden organization and workspace are derived from your OIDC session.</p>
      {(message || error) && <div className={`alert ${error ? 'error' : 'success'}`}>{error || message}</div>}

      <div className="lab-advanced-grid">
        <LabTool icon={Cloud} step="01" title="Upstream" detail="Create a declarative mock or a restricted public HTTPS target.">
          <form onSubmit={createUpstream}>
            <label><span>Name</span><input required value={upstreamName} onChange={event => setUpstreamName(event.target.value)} /></label>
            <label><span>Kind</span><select value={upstreamKind} onChange={event => setUpstreamKind(event.target.value as typeof upstreamKind)}><option value="mock">Managed mock</option><option value="publicHttps">Public HTTPS</option></select></label>
            {upstreamKind === 'mock' ? <><label><span>GET path</span><input required value={mockPath} onChange={event => setMockPath(event.target.value)} /></label><label><span>JSON response</span><textarea value={mockBody} onChange={event => setMockBody(event.target.value)} /></label></> : <label><span>HTTPS base URL</span><input required type="url" value={upstreamUrl} onChange={event => setUpstreamUrl(event.target.value)} /></label>}
            <button className="secondary-command" type="submit" disabled={Boolean(busy)}><Plus /> Create upstream</button>
          </form>
        </LabTool>

        <LabTool icon={Route} step="02" title="Proxy and deployment" detail="Import OpenAPI plus Gateway YAML and deploy its first immutable revision.">
          <form onSubmit={importAndDeploy}>
            <label><span>Name</span><input required value={proxyName} onChange={event => setProxyName(event.target.value)} /></label>
            <label><span>OpenAPI</span><input required type="file" accept=".json,.yaml,.yml" onChange={event => setOpenapiFile(event.target.files?.[0] ?? null)} /></label>
            <label><span>Gateway YAML</span><input required type="file" accept=".yaml,.yml,.json" onChange={event => setGatewayFile(event.target.files?.[0] ?? null)} /></label>
            <label><span>Upstream</span><select required value={deploymentUpstreamId} onChange={event => setDeploymentUpstreamId(event.target.value)}>{upstreams.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label><span>Qual environment</span><select required value={deploymentEnvironmentId} onChange={event => setDeploymentEnvironmentId(event.target.value)}>{environments.map(item => <option value={item.id} key={item.id}>{item.region.toUpperCase()} · QUAL</option>)}</select></label>
            <button className="secondary-command" type="submit" disabled={Boolean(busy) || !deploymentUpstreamId}><FileUp /> Import and deploy</button>
          </form>
        </LabTool>

        <LabTool icon={Boxes} step="03" title="Product" detail="Grant scopes over a logical proxy in the selected qual environment.">
          <form onSubmit={createProduct}>
            <label><span>Name</span><input required value={productName} onChange={event => setProductName(event.target.value)} /></label>
            <label><span>Scopes</span><input required value={productScopes} onChange={event => setProductScopes(event.target.value)} /></label>
            <label><span>Proxy</span><select required value={productProxyId} onChange={event => setProductProxyId(event.target.value)}>{proxies.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <button className="secondary-command" type="submit" disabled={Boolean(busy) || !productProxyId}><Plus /> Create product</button>
          </form>
        </LabTool>

        <LabTool icon={AppWindow} step="04" title="Application" detail="Create an app, approved credential and product grant in one operation.">
          <form onSubmit={createApp}>
            <label><span>Name</span><input required value={appName} onChange={event => setAppName(event.target.value)} /></label>
            <label><span>Product</span><select required value={appProductId} onChange={event => setAppProductId(event.target.value)}>{products.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <button className="secondary-command" type="submit" disabled={Boolean(busy) || !appProductId}><Plus /> Create application</button>
          </form>
        </LabTool>

        <LabTool icon={KeyRound} step="05" title="Credential" detail="Change an opaque consumer key or rotate its one-time secret.">
          <form onSubmit={updateConsumerKey}>
            <label><span>Credential</span><select value={credentialId} onChange={event => { const id = event.target.value; setCredentialId(id); setConsumerKey(credentials.find(item => item.id === id)?.consumerKey ?? ''); }}>{credentials.map(item => <option value={item.id} key={item.id}>{item.appName} · {item.consumerKey}</option>)}</select></label>
            <label><span>Consumer key</span><input required value={consumerKey} onChange={event => setConsumerKey(event.target.value)} /></label>
            <div className="lab-tool-actions"><button className="secondary-command" type="submit" disabled={Boolean(busy) || !credentialId}><RefreshCw /> Update key</button><button className="secondary-command" type="button" onClick={rotateSecret} disabled={Boolean(busy) || !credentialId}><KeyRound /> Rotate secret</button></div>
          </form>
        </LabTool>

        <LabTool icon={Activity} step="06" title="Recent audit" detail="Every mutation remains attributable to your OIDC identity.">
          <ol className="lab-audit-list">{auditEvents.slice(0, 8).map(event => <li key={event.id}><span><Activity /></span><div><strong>{event.action}</strong><code>{event.resourceType} · {event.resourceId ?? 'workspace'}</code></div><time>{new Date(event.createdAt).toLocaleTimeString()}</time></li>)}</ol>
        </LabTool>
      </div>
      {busy && <div className="lab-operation-progress" aria-live="polite"><LoaderCircle className="is-spinning" /> {busy}</div>}
    </section>
  );
}

function LabTool({
  icon: Icon,
  step,
  title,
  detail,
  children,
}: {
  icon: typeof Server;
  step: string;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return <section className="lab-tool"><header><span><Icon /></span><div><code>{step}</code><h3>{title}</h3><p>{detail}</p></div></header>{children}</section>;
}
