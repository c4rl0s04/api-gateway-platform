'use client';

import {
  ArrowRight,
  Clock3,
  Copy,
  KeyRound,
  Network,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  TestTube2,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LabApiError, labFetch } from '@/lib/lab-api';
import { LabQuickPlayground } from '@/components/lab-quick-playground';
import { LabAdvancedWorkspace } from '@/components/lab-advanced-workspace';
import { LabProxyInspector } from '@/components/lab-proxy-inspector';
import type { ApiProxySummary } from '@/lib/api-client';

interface LabWorkspaceRecord {
  id: string;
  hostname: string;
  status: 'active' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  organization: { id: string; name: string; kind: 'lab' };
  _count: { deployments: number; upstreams: number };
}

interface LabProduct {
  id: string;
  name: string;
  active: boolean;
  scopes: string[];
  proxies: Array<{ id: string; name: string }>;
}

interface LabCredential {
  id: string;
  consumerKey: string;
  purpose: 'lab';
  status: string;
}

interface LabApplication {
  id: string;
  name: string;
  status: string;
  credentials: LabCredential[];
}

interface LabUpstream {
  id: string;
  name: string;
  kind: 'mock' | 'publicHttps';
  active: boolean;
}

interface LabBootstrapResponse {
  workspace: LabWorkspaceRecord;
  created?: boolean;
  sample?: {
    application?: {
      application: LabApplication;
      credential: LabCredential;
      consumerSecret: string;
    };
  };
}

interface Inventory {
  proxies: ApiProxySummary[];
  products: LabProduct[];
  apps: LabApplication[];
  upstreams: LabUpstream[];
}

const emptyInventory: Inventory = { proxies: [], products: [], apps: [], upstreams: [] };

function timeRemaining(expiresAt: string): string {
  const milliseconds = new Date(expiresAt).getTime() - Date.now();
  if (milliseconds <= 0) return 'Expired';
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

export function PersonalLabWorkspace() {
  const [workspace, setWorkspace] = useState<LabWorkspaceRecord | null>(null);
  const [inventory, setInventory] = useState<Inventory>(emptyInventory);
  const [consumerSecret, setConsumerSecret] = useState('');
  const [state, setState] = useState<'loading' | 'missing' | 'ready' | 'busy' | 'error'>('loading');
  const [error, setError] = useState('');

  const loadInventory = useCallback(async () => {
    const [proxies, products, apps, upstreams] = await Promise.all([
      labFetch<ApiProxySummary[]>('proxies'),
      labFetch<LabProduct[]>('products'),
      labFetch<LabApplication[]>('apps'),
      labFetch<LabUpstream[]>('upstreams'),
    ]);
    setInventory({ proxies, products, apps, upstreams });
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const current = await labFetch<LabWorkspaceRecord>('workspace');
      setWorkspace(current);
      await loadInventory();
      setState('ready');
    } catch (cause) {
      if (cause instanceof LabApiError && cause.code === 'lab_resource_not_found') {
        setWorkspace(null);
        setInventory(emptyInventory);
        setState('missing');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Personal lab could not be loaded');
      setState('error');
    }
  }, [loadInventory]);

  useEffect(() => { void load(); }, [load]);

  const mutateWorkspace = useCallback(async (action: 'create' | 'reset' | 'revoke') => {
    setState('busy');
    setError('');
    try {
      if (action === 'revoke') {
        await labFetch('workspace/revoke', { method: 'POST', body: '{}' });
        setWorkspace(null);
        setInventory(emptyInventory);
        setConsumerSecret('');
        setState('missing');
        return;
      }
      const path = action === 'create' ? 'workspace' : 'workspace/reset';
      const result = await labFetch<LabBootstrapResponse>(path, { method: 'POST', body: '{}' });
      setWorkspace(result.workspace);
      setConsumerSecret(result.sample?.application?.consumerSecret ?? '');
      await loadInventory();
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Personal lab operation failed');
      setState(workspace ? 'ready' : 'error');
    }
  }, [loadInventory, workspace]);

  const facts = useMemo(() => workspace ? [
    { label: 'Runtime', value: `https://${workspace.hostname}:8443`, icon: Network },
    { label: 'Lifetime', value: timeRemaining(workspace.expiresAt), icon: Clock3 },
    { label: 'Deployments', value: String(inventory.proxies.flatMap(proxy => proxy.deployments).length), icon: ServerCog },
    { label: 'Credentials', value: String(inventory.apps.flatMap(app => app.credentials).length), icon: KeyRound },
  ] : [], [inventory, workspace]);

  if (state === 'loading') {
    return <section className="lab-loading" aria-live="polite"><RefreshCw className="is-spinning" /><span>Loading personal lab</span></section>;
  }

  if (!workspace) {
    return (
      <section className="lab-empty">
        <TestTube2 aria-hidden="true" />
        <div>
          <span className="section-kicker">Isolated learning environment</span>
          <h1>Personal gateway lab</h1>
          <p>Create a 24-hour workspace backed by the real gateway, policies, PostgreSQL and Redis. Its resources remain separate from every organization.</p>
          {error && <div className="alert error">{error}</div>}
          <button className="primary-command" type="button" onClick={() => void mutateWorkspace('create')} disabled={state === 'busy'}>
            <TestTube2 />
            {state === 'busy' ? 'Preparing workspace' : 'Create personal lab'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="lab-page">
      <header className="lab-header">
        <div>
          <span className="section-kicker">Personal gateway lab</span>
          <h1>Build without touching shared configuration.</h1>
          <p>{workspace.organization.name} · <code>{workspace.id}</code></p>
        </div>
        <div className="lab-header-actions">
          <button className="secondary-command" type="button" onClick={() => void mutateWorkspace('reset')} disabled={state === 'busy'} title="Reset sample resources">
            <RotateCcw /> Reset
          </button>
          <button className="icon-command" type="button" onClick={() => void mutateWorkspace('revoke')} disabled={state === 'busy'} title="Revoke workspace" aria-label="Revoke workspace">
            <Trash2 />
          </button>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}

      <dl className="lab-facts">
        {facts.map(fact => {
          const Icon = fact.icon;
          return <div key={fact.label}><Icon /><dt>{fact.label}</dt><dd>{fact.value}</dd></div>;
        })}
      </dl>

      {consumerSecret && (
        <section className="lab-secret" aria-live="polite">
          <ShieldCheck />
          <div>
            <strong>Initial consumer secret</strong>
            <p>This value is available only in this tab. It cannot be recovered after a refresh.</p>
            <code>{consumerSecret}</code>
          </div>
          <button className="icon-command" type="button" title="Copy consumer secret" aria-label="Copy consumer secret" onClick={() => void navigator.clipboard.writeText(consumerSecret)}>
            <Copy />
          </button>
        </section>
      )}

      <section className="lab-flow">
        <header><div><span className="section-kicker">Runnable example</span><h2>How the sample is connected</h2></div><span>{inventory.proxies.length + inventory.products.length + inventory.apps.length + inventory.upstreams.length} resources</span></header>
        <div className="lab-flow-track">
          <FlowNode label="Upstream" items={inventory.upstreams.map(item => ({ id: item.id, name: item.name, detail: item.kind }))} />
          <ArrowRight className="lab-flow-arrow" />
          <FlowNode label="Proxy" items={inventory.proxies.map(item => ({ id: item.id, name: item.name, detail: item.revisions[0]?.basePath ?? 'No revision' }))} />
          <ArrowRight className="lab-flow-arrow" />
          <FlowNode label="Product" items={inventory.products.map(item => ({ id: item.id, name: item.name, detail: item.scopes.join(', ') }))} />
          <ArrowRight className="lab-flow-arrow" />
          <FlowNode label="Application" items={inventory.apps.map(item => ({ id: item.id, name: item.name, detail: item.credentials[0]?.consumerKey ?? 'No credential' }))} />
        </div>
      </section>

      <LabQuickPlayground
        hostname={workspace.hostname}
        proxies={inventory.proxies}
        applications={inventory.apps}
        consumerSecret={consumerSecret}
        onConsumerSecret={setConsumerSecret}
      />

      <LabProxyInspector
        hostname={workspace.hostname}
        proxies={inventory.proxies}
        upstreams={inventory.upstreams}
      />

      <LabAdvancedWorkspace
        proxies={inventory.proxies}
        products={inventory.products}
        applications={inventory.apps}
        upstreams={inventory.upstreams}
        onChanged={loadInventory}
        onConsumerSecret={setConsumerSecret}
      />
    </div>
  );
}

function FlowNode({
  label,
  items,
}: {
  label: string;
  items: Array<{ id: string; name: string; detail: string }>;
}) {
  return (
    <section className="lab-flow-node">
      <span>{label}</span>
      {items.length > 0 ? items.map(item => (
        <div key={item.id}><strong>{item.name}</strong><code>{item.detail}</code></div>
      )) : <p>Not configured</p>}
    </section>
  );
}
