'use client';

import {
  ArrowRight,
  Cable,
  CheckCircle2,
  CircleDot,
  FileKey2,
  KeyRound,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProxyDeployment,
  ProxyOperation,
  ProxyRevisionDetail,
} from '@/lib/api-client';
import {
  createBrowserJwtIdentity,
  signBrowserJwtAssertion,
  type BrowserJwtIdentity,
} from '@/lib/browser-jwt';
import { LabApiError, labFetch } from '@/lib/lab-api';
import {
  authenticationRequirement,
  operationSupportsBody,
  type PlaygroundAuthenticationRequirement,
} from '@/lib/playground';
import { executeLabPlayground, PlaygroundApiError } from '@/lib/playground-api';
import type { PlaygroundExecutionResult } from '@/lib/playground-service';
import { useLocalAgent } from '@/lib/use-local-agent';

interface LabProxyOption {
  id: string;
  name: string;
}

interface LabCredentialOption {
  id: string;
  consumerKey: string;
  status: string;
}

interface LabApplicationOption {
  id: string;
  name: string;
  credentials: LabCredentialOption[];
}

interface LabQuickPlaygroundProps {
  hostname: string;
  proxies: LabProxyOption[];
  applications: LabApplicationOption[];
  consumerSecret: string;
  onConsumerSecret(secret: string): void;
}

type OAuthMode = 'clientCredentials' | 'browserJwt';

function workspaceOrigin(deployment: ProxyDeployment, hostname: string): string {
  const origin = new URL(deployment.environment.publicOrigin);
  origin.hostname = hostname;
  return origin.origin;
}

function operationTarget(
  deployment: ProxyDeployment,
  revision: ProxyRevisionDetail,
  operation: ProxyOperation,
  hostname: string,
): string {
  return new URL(
    `${revision.basePath.replace(/\/$/u, '')}/${operation.path.replace(/^\//u, '')}`,
    workspaceOrigin(deployment, hostname),
  ).toString();
}

function responseBody(result: PlaygroundExecutionResult): string {
  if (!result.response.body) return '(empty body)';
  try {
    return JSON.stringify(JSON.parse(result.response.body), null, 2);
  } catch {
    return result.response.body;
  }
}

function policyLabel(requirement: PlaygroundAuthenticationRequirement): string {
  if (requirement.type === 'apiKey') return 'API key';
  if (requirement.type === 'oauth') return 'OAuth access token';
  if (requirement.type === 'mtls') return 'Client certificate';
  if (requirement.type === 'none') return 'No authentication';
  return requirement.type;
}

export function LabQuickPlayground({
  hostname,
  proxies,
  applications,
  consumerSecret,
  onConsumerSecret,
}: LabQuickPlaygroundProps) {
  const [proxyId, setProxyId] = useState(proxies[0]?.id ?? '');
  const [deployments, setDeployments] = useState<ProxyDeployment[]>([]);
  const [revision, setRevision] = useState<ProxyRevisionDetail | null>(null);
  const [operationId, setOperationId] = useState('');
  const [body, setBody] = useState('');
  const [oauthMode, setOauthMode] = useState<OAuthMode>('clientCredentials');
  const [browserIdentity, setBrowserIdentity] = useState<BrowserJwtIdentity | null>(null);
  const [localIdentityId, setLocalIdentityId] = useState('');
  const [result, setResult] = useState<PlaygroundExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const localAgent = useLocalAgent();

  const credential = useMemo(() => applications
    .flatMap(application => application.credentials)
    .find(candidate => candidate.status === 'approved') ?? null, [applications]);
  const deployment = useMemo(
    () => deployments.find(candidate => candidate.status === 'active') ?? null,
    [deployments],
  );
  const operation = useMemo(
    () => revision?.operations.find(candidate => candidate.operationId === operationId) ?? null,
    [operationId, revision],
  );
  const requirement = useMemo<PlaygroundAuthenticationRequirement>(
    () => operation ? authenticationRequirement(operation.policies) : { type: 'none' },
    [operation],
  );
  const target = useMemo(
    () => deployment && revision && operation
      ? operationTarget(deployment, revision, operation, hostname)
      : '',
    [deployment, hostname, operation, revision],
  );
  const mtlsIdentities = useMemo(
    () => localAgent.identities.filter(identity => identity.type === 'mtls'),
    [localAgent.identities],
  );
  const selectedMtlsIdentity = useMemo(
    () => mtlsIdentities.find(identity => identity.id === localIdentityId) ?? null,
    [localIdentityId, mtlsIdentities],
  );

  useEffect(() => {
    if (!proxies.some(proxy => proxy.id === proxyId)) setProxyId(proxies[0]?.id ?? '');
  }, [proxies, proxyId]);

  useEffect(() => {
    if (!proxyId) return;
    let active = true;
    setLoading(true);
    setError('');
    setResult(null);
    void labFetch<ProxyDeployment[]>(`proxies/${proxyId}/deployments`)
      .then(async nextDeployments => {
        const nextDeployment = nextDeployments.find(candidate => candidate.status === 'active');
        if (!nextDeployment) throw new Error('The selected proxy has no active deployment');
        const nextRevision = await labFetch<ProxyRevisionDetail>(
          `proxies/${proxyId}/revisions/${nextDeployment.revision.revisionNumber}`,
        );
        if (!active) return;
        setDeployments(nextDeployments);
        setRevision(nextRevision);
        setOperationId(nextRevision.operations[0]?.operationId ?? '');
      })
      .catch(cause => active && setError(
        cause instanceof Error ? cause.message : 'Lab runtime configuration could not be loaded',
      ))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [proxyId]);

  useEffect(() => {
    const example = operation?.requestBodies[0]?.examples[0]?.body ?? '';
    setBody(example);
    setResult(null);
    setError('');
  }, [operation]);

  useEffect(() => {
    if (!mtlsIdentities.some(identity => identity.id === localIdentityId)) {
      setLocalIdentityId(mtlsIdentities[0]?.id ?? '');
    }
  }, [localIdentityId, mtlsIdentities]);

  const rotateSecret = useCallback(async () => {
    if (!credential) return;
    setRunning(true);
    setError('');
    try {
      const rotated = await labFetch<{ consumerSecret: string }>(
        `credentials/${credential.id}/rotate-secret`,
        { method: 'POST', body: '{}' },
      );
      onConsumerSecret(rotated.consumerSecret);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A new test secret could not be created');
    } finally {
      setRunning(false);
    }
  }, [credential, onConsumerSecret]);

  const prepareBrowserJwt = useCallback(async () => {
    if (!credential) return null;
    setRunning(true);
    setError('');
    try {
      const identity = await createBrowserJwtIdentity();
      await labFetch(`credentials/${credential.id}/public-keys`, {
        method: 'POST',
        body: JSON.stringify({ kid: identity.kid, jwk: identity.publicJwk }),
      });
      setBrowserIdentity(identity);
      return identity;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Browser signing identity could not be prepared');
      return null;
    } finally {
      setRunning(false);
    }
  }, [credential]);

  const run = useCallback(async () => {
    if (!credential || !deployment || !revision || !operation || !target) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const requiredScopes = requirement.type === 'oauth' ? requirement.requiredScopes.join(' ') : '';
      let authentication: Parameters<typeof executeLabPlayground>[0]['authentication'];
      if (requirement.type === 'apiKey') {
        authentication = { type: 'apiKey', value: credential.consumerKey };
      } else if (requirement.type === 'oauth' && oauthMode === 'clientCredentials') {
        if (!consumerSecret) throw new Error('Generate a fresh lab secret before this request');
        authentication = {
          type: 'clientCredentials',
          consumerKey: credential.consumerKey,
          consumerSecret,
          scope: requiredScopes,
        };
      } else if (requirement.type === 'oauth') {
        const identity = browserIdentity ?? await prepareBrowserJwt();
        if (!identity) return;
        const signed = await signBrowserJwtAssertion({
          identity,
          consumerKey: credential.consumerKey,
          audience: new URL('/oauth/token', workspaceOrigin(deployment, hostname)).toString(),
        });
        authentication = { type: 'jwtBearer', assertion: signed.assertion, scope: requiredScopes };
      } else {
        authentication = { type: 'none' };
      }
      const nextResult = await executeLabPlayground({
        proxyId,
        deploymentId: deployment.id,
        operationId: operation.operationId,
        pathParameters: {},
        queryParameters: [],
        headers: [],
        targetUrl: target,
        ...(body ? { body, bodyMediaType: operation.requestBodies[0]?.mediaType ?? 'application/json' } : {}),
        authentication,
      });
      setResult(nextResult);
    } catch (cause) {
      setError(cause instanceof PlaygroundApiError || cause instanceof LabApiError || cause instanceof Error
        ? cause.message
        : 'Lab request failed');
    } finally {
      setRunning(false);
    }
  }, [body, browserIdentity, consumerSecret, credential, deployment, hostname, oauthMode, operation, prepareBrowserJwt, proxyId, requirement, revision, target]);

  const generateMtlsIdentity = useCallback(async () => {
    const client = localAgent.state.status === 'connected' ? localAgent.state.client : null;
    if (!client || !credential) return;
    setRunning(true);
    setError('');
    try {
      const generated = await localAgent.track('Generate lab mTLS key and CSR', () =>
        client.generateMtlsIdentity({
          name: `lab-${credential.id.slice(0, 12)}`,
          credentialId: credential.id,
        }));
      await localAgent.refreshIdentities(client);
      setLocalIdentityId(generated.identity.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'mTLS identity could not be generated');
    } finally {
      setRunning(false);
    }
  }, [credential, localAgent]);

  const issueMtlsCertificate = useCallback(async () => {
    const client = localAgent.state.status === 'connected' ? localAgent.state.client : null;
    if (!client || !credential || !selectedMtlsIdentity) return;
    setRunning(true);
    setError('');
    try {
      const { csr } = await localAgent.track('Read local CSR', () =>
        client.getCsr(selectedMtlsIdentity.id));
      const issued = await labFetch<{ id: string }>(
        `credentials/${credential.id}/certificates`,
        { method: 'POST', body: JSON.stringify({ csrPem: csr, validityDays: 1 }) },
      );
      const material = await labFetch<{ certificatePem: string; chainPem: string | null }>(
        `certificates/${issued.id}/download`,
      );
      await localAgent.track('Install issued lab certificate', () =>
        client.installCertificate({
          identityId: selectedMtlsIdentity.id,
          certificatePem: material.certificatePem,
          chainPem: material.chainPem ?? undefined,
        }));
      await localAgent.refreshIdentities(client);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Client certificate could not be issued');
    } finally {
      setRunning(false);
    }
  }, [credential, localAgent, selectedMtlsIdentity]);

  const runMtls = useCallback(async () => {
    const client = localAgent.state.status === 'connected' ? localAgent.state.client : null;
    if (!client
      || !selectedMtlsIdentity?.hasCertificate
      || !operation
      || !target) return;
    setRunning(true);
    setError('');
    setResult(null);
    const startedAt = performance.now();
    try {
      const response = await localAgent.track('Execute lab request with local certificate', () =>
        client.executeMtlsRequest({
          identityId: selectedMtlsIdentity.id,
          method: operation.method,
          url: target,
          headers: { accept: 'application/json' },
          ...(body ? { body } : {}),
        }));
      setResult({
        request: { method: operation.method, url: target, headers: {}, curl: 'Executed by gatewayctl' },
        response: {
          status: response.status,
          statusText: '',
          headers: Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [
            name,
            Array.isArray(value) ? value.join(', ') : value,
          ])),
          body: response.body,
          durationMs: Math.round(performance.now() - startedAt),
          truncated: false,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'mTLS request failed');
    } finally {
      setRunning(false);
    }
  }, [body, localAgent, operation, selectedMtlsIdentity, target]);

  if (proxies.length === 0) return null;

  return (
    <section className="lab-playground">
      <header className="lab-section-header">
        <div><span className="section-kicker">Quick verification</span><h2>Run the deployed sample</h2></div>
        <span className="lab-agent-state" data-connected={localAgent.state.status === 'connected'}>
          <CircleDot /> {localAgent.state.status === 'connected' ? 'Local agent connected' : 'Local agent disconnected'}
        </span>
      </header>

      <div className="lab-playground-grid">
        <div className="lab-request-panel">
          <div className="lab-selectors">
            <label><span>Proxy</span><select value={proxyId} onChange={event => setProxyId(event.target.value)}>{proxies.map(proxy => <option value={proxy.id} key={proxy.id}>{proxy.name}</option>)}</select></label>
            <label><span>Operation</span><select value={operationId} onChange={event => setOperationId(event.target.value)} disabled={loading}>{revision?.operations.map(item => <option value={item.operationId} key={item.id}>{item.method.toUpperCase()} {item.path}</option>)}</select></label>
          </div>

          <div className="lab-request-target"><span>{operation?.method.toUpperCase() ?? '—'}</span><code>{target || 'Loading deployed route'}</code></div>
          <div className="lab-auth-summary"><ShieldCheck /><div><span>Authorization</span><strong>{policyLabel(requirement)}</strong></div></div>

          {requirement.type === 'oauth' && (
            <div className="lab-oauth-mode">
              <button type="button" className={oauthMode === 'clientCredentials' ? 'is-active' : ''} onClick={() => setOauthMode('clientCredentials')}><KeyRound /> Client credentials</button>
              <button type="button" className={oauthMode === 'browserJwt' ? 'is-active' : ''} onClick={() => setOauthMode('browserJwt')}><FileKey2 /> Browser JWT</button>
              {oauthMode === 'clientCredentials' && !consumerSecret && <button type="button" className="lab-inline-action" onClick={() => void rotateSecret()} disabled={running}><RefreshCw /> Generate test secret</button>}
              {oauthMode === 'browserJwt' && <p>{browserIdentity ? 'Temporary public key registered. A fresh 60-second assertion is signed for every request.' : 'A temporary RSA key will be generated in this tab and only its public JWK will be registered.'}</p>}
            </div>
          )}

          {operation && operationSupportsBody(operation) && (
            <label className="lab-body-field"><span>Request body</span><textarea value={body} onChange={event => setBody(event.target.value)} spellCheck={false} /></label>
          )}

          {requirement.type === 'mtls' ? (
            <div className="lab-mtls-workflow">
              <ol aria-label="mTLS request flow">
                <li data-complete={Boolean(selectedMtlsIdentity)}><span>1</span><div><strong>Generate</strong><small>Key + CSR · local agent</small></div></li>
                <ArrowRight />
                <li data-complete={selectedMtlsIdentity?.hasCertificate}><span>2</span><div><strong>Issue</strong><small>Certificate · platform</small></div></li>
                <ArrowRight />
                <li data-complete={selectedMtlsIdentity?.hasCertificate}><span>3</span><div><strong>Install</strong><small>Public cert · local agent</small></div></li>
                <ArrowRight />
                <li data-complete={Boolean(result)}><span>4</span><div><strong>Connect</strong><small>Certificate + private key</small></div></li>
              </ol>
              <div className="lab-mtls-actions">
                {localAgent.state.status !== 'connected' ? (
                  <><button type="button" className="secondary-command" onClick={() => void localAgent.connect()}><Cable /> Connect local agent</button><code>npm run gatewayctl -- agent start</code></>
                ) : (
                  <>
                    <select aria-label="Local mTLS identity" value={localIdentityId} onChange={event => setLocalIdentityId(event.target.value)}><option value="">Select local identity</option>{mtlsIdentities.map(identity => <option value={identity.id} key={identity.id}>{identity.name}</option>)}</select>
                    <button type="button" className="secondary-command" onClick={() => void generateMtlsIdentity()} disabled={running}><KeyRound /> Generate key and CSR</button>
                    {selectedMtlsIdentity && !selectedMtlsIdentity.hasCertificate && <button type="button" className="secondary-command" onClick={() => void issueMtlsCertificate()} disabled={running}><FileKey2 /> Issue certificate</button>}
                    <button type="button" className="primary-command" onClick={() => void runMtls()} disabled={running || !selectedMtlsIdentity?.hasCertificate}><Play /> Run with certificate</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <button type="button" className="primary-command lab-run" onClick={() => void run()} disabled={running || loading || !operation || !credential}>
              {running ? <LoaderCircle className="is-spinning" /> : <Play />} Run request
            </button>
          )}
          {error && <div className="alert error" role="alert">{error}</div>}
        </div>

        <div className="lab-response-panel">
          <header><span>Response</span>{result && <strong data-status={result.response.status >= 400 ? 'error' : 'success'}>{result.response.status} · {result.response.durationMs} ms</strong>}</header>
          {result ? <pre>{responseBody(result)}</pre> : <div className="lab-response-empty"><CheckCircle2 /><p>Run an operation to inspect the real gateway response.</p></div>}
        </div>
      </div>

      {localAgent.activity.length > 0 && <ol className="lab-agent-log">{localAgent.activity.map(item => <li key={item.id} data-status={item.status}><span>{item.status === 'running' ? <LoaderCircle className="is-spinning" /> : <CheckCircle2 />}</span><strong>{item.label}</strong><code>{item.durationMs === undefined ? 'running' : `${item.durationMs} ms`}</code></li>)}</ol>}
    </section>
  );
}
