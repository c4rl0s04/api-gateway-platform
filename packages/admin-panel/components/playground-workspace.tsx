'use client';

import {
  Braces,
  Check,
  Clock3,
  Copy,
  FileKey2,
  FlaskConical,
  KeyRound,
  Plus,
  Send,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  managementFetch,
  type ApiProxyDetail,
  type ApiProxySummary,
  type AppCredential,
  type DeveloperApp,
  type ProxyDeployment,
  type ProxyOperation,
  type ProxyRevisionDetail,
} from '@/lib/api-client';
import {
  authenticationRequirement,
  operationSupportsBody,
  type PlaygroundAuthentication,
  type PlaygroundAuthenticationRequirement,
  type PlaygroundParameter,
} from '@/lib/playground';
import { executePlayground, PlaygroundApiError } from '@/lib/playground-api';
import type { PlaygroundExecutionResult } from '@/lib/playground-service';
import { environmentLabel } from '@/lib/proxy-control';
import { CatalogCombobox, type CatalogOption } from '@/components/catalog-combobox';

type OAuthMode = 'clientCredentials' | 'bearerToken' | 'jwtBearer';
type ResponseView = 'body' | 'headers' | 'request';
interface EditableParameter extends PlaygroundParameter { id: number }

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
}

function activeCredentials(
  apps: DeveloperApp[],
  productIds: Set<string>,
): Array<AppCredential & { appName: string }> {
  return apps.flatMap(app => app.status === 'approved'
    ? app.credentials
        .filter(credential => credential.status === 'approved'
          && (!credential.expiresAt || new Date(credential.expiresAt) > new Date())
          && credential.productGrants.some(grant =>
            grant.status === 'approved' && productIds.has(grant.product.id)))
        .map(credential => ({ ...credential, appName: app.name }))
    : []);
}

function previewTarget(
  deployment: ProxyDeployment | null,
  revision: ProxyRevisionDetail | null,
  operation: ProxyOperation | null,
  pathValues: Record<string, string>,
  query: EditableParameter[],
): string {
  if (!deployment || !revision || !operation) return 'Select an active operation';
  const operationPath = operation.path.replace(/\{([^}]+)\}/g, (_match, name: string) =>
    pathValues[name] ? encodeURIComponent(pathValues[name]) : `{${name}}`);
  const target = new URL(
    `${revision.basePath.replace(/\/$/, '')}/${operationPath.replace(/^\//, '')}`,
    deployment.environment.publicOrigin,
  );
  query.filter(item => item.name).forEach(item => target.searchParams.append(item.name, item.value));
  return target.toString();
}

function prettyBody(result: PlaygroundExecutionResult): string {
  if (!result.response.body) return '(empty response body)';
  if (!result.response.headers['content-type']?.includes('json')) return result.response.body;
  try {
    return JSON.stringify(JSON.parse(result.response.body), null, 2);
  } catch {
    return result.response.body;
  }
}

function methodTone(status: number): string {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'redirect';
  return 'success';
}

export function PlaygroundWorkspace() {
  const nextParameterId = useRef(1);
  const [proxies, setProxies] = useState<ApiProxySummary[]>([]);
  const [proxyId, setProxyId] = useState('');
  const [proxy, setProxy] = useState<ApiProxyDetail | null>(null);
  const [deployments, setDeployments] = useState<ProxyDeployment[]>([]);
  const [deploymentId, setDeploymentId] = useState('');
  const [revision, setRevision] = useState<ProxyRevisionDetail | null>(null);
  const [operationId, setOperationId] = useState('');
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<EditableParameter[]>([]);
  const [headers, setHeaders] = useState<EditableParameter[]>([]);
  const [body, setBody] = useState('');
  const [oauthMode, setOauthMode] = useState<OAuthMode>('clientCredentials');
  const [credentialId, setCredentialId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [scope, setScope] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [assertion, setAssertion] = useState('');
  const [result, setResult] = useState<PlaygroundExecutionResult | null>(null);
  const [responseView, setResponseView] = useState<ResponseView>('body');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');

  const selectedDeployment = useMemo(
    () => deployments.find(deployment => deployment.id === deploymentId) ?? null,
    [deploymentId, deployments],
  );
  const selectedOperation = useMemo(
    () => revision?.operations.find(operation => operation.operationId === operationId) ?? null,
    [operationId, revision],
  );
  const requirement = useMemo<PlaygroundAuthenticationRequirement>(
    () => selectedOperation
      ? authenticationRequirement(selectedOperation.policies)
      : { type: 'none' },
    [selectedOperation],
  );
  const credentials = useMemo(
    () => activeCredentials(apps, new Set(proxy?.products.map(product => product.id) ?? [])),
    [apps, proxy],
  );
  const pathNames = useMemo(
    () => selectedOperation ? pathParameterNames(selectedOperation.path) : [],
    [selectedOperation],
  );
  const target = useMemo(
    () => previewTarget(selectedDeployment, revision, selectedOperation, pathValues, query),
    [pathValues, query, revision, selectedDeployment, selectedOperation],
  );
  const proxyOptions = useMemo<CatalogOption[]>(() => proxies.map(item => ({
    value: item.id,
    label: item.name,
    description: item.systemManaged ? 'Managed platform service' : item.organization.name,
    group: item.systemManaged ? 'Platform services' : 'Business proxies',
    keywords: [item.id, item.organization.name],
  })), [proxies]);
  const deploymentOptions = useMemo<CatalogOption[]>(() => deployments.map(item => ({
    value: item.id,
    label: environmentLabel(item.environment),
    description: `Revision ${item.revision.revisionNumber} · ${item.environment.publicOrigin}`,
    keywords: [item.environment.id, item.environment.region, item.environment.stage],
  })), [deployments]);
  const operationOptions = useMemo<CatalogOption[]>(() => revision?.operations.map(operation => ({
    value: operation.operationId,
    label: `${operation.method.toUpperCase()} ${operation.path}`,
    description: operation.operationId,
    keywords: operation.policies.map(policy => policy.type),
  })) ?? [], [revision]);

  useEffect(() => {
    managementFetch<ApiProxySummary[]>('proxies')
      .then(items => {
        const executable = items.filter(item => item.active
          && item.deployments.length > 0
          && (!item.systemManaged || item.id === 'proxy-platform-oauth'));
        setProxies(executable);
        setProxyId(executable[0]?.id ?? '');
        setError('');
      })
      .catch(cause => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!proxyId) {
      setProxy(null);
      setDeployments([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setCredentialId('');
    setApiKey('');
    setConsumerKey('');
    setConsumerSecret('');
    setBearerToken('');
    setAssertion('');
    Promise.all([
      managementFetch<ApiProxyDetail>(`proxies/${proxyId}`, { signal: controller.signal }),
      managementFetch<ProxyDeployment[]>(`proxies/${proxyId}/deployments`, {
        signal: controller.signal,
      }),
    ]).then(async ([nextProxy, allDeployments]) => {
      const active = allDeployments
        .filter(deployment => deployment.status === 'active')
        .sort((left, right) => left.environment.region.localeCompare(right.environment.region)
          || left.environment.stage.localeCompare(right.environment.stage));
      setProxy(nextProxy);
      setDeployments(active);
      setDeploymentId(active[0]?.id ?? '');
      setResult(null);
      return managementFetch<DeveloperApp[]>(
        `organizations/${nextProxy.organizationId}/apps`,
        { signal: controller.signal },
      );
    }).then(setApps).catch(cause => {
      if (cause.name !== 'AbortError') setError(cause.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [proxyId]);

  useEffect(() => {
    if (!selectedDeployment || !proxyId) {
      setRevision(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    managementFetch<ProxyRevisionDetail>(
      `proxies/${proxyId}/revisions/${selectedDeployment.revision.revisionNumber}`,
      { signal: controller.signal },
    ).then(nextRevision => {
      setRevision(nextRevision);
      setOperationId(nextRevision.operations[0]?.operationId ?? '');
      setError('');
      setResult(null);
    }).catch(cause => {
      if (cause.name !== 'AbortError') setError(cause.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [proxyId, selectedDeployment]);

  useEffect(() => {
    setPathValues(Object.fromEntries(pathNames.map(name => [name, ''])));
    setQuery([]);
    setHeaders([]);
    setBody('');
    setConsumerSecret('');
    setBearerToken('');
    setAssertion('');
    setResult(null);
    setResponseView('body');
    if (requirement.type === 'oauth') {
      setScope(requirement.requiredScopes.join(' '));
      setOauthMode('clientCredentials');
    } else {
      setScope('');
    }
  }, [operationId, pathNames.join('|'), requirement.type]);

  useEffect(() => {
    const selected = credentials.find(credential => credential.id === credentialId);
    if (!selected) return;
    setApiKey(selected.consumerKey);
    setConsumerKey(selected.consumerKey);
  }, [credentialId, credentials]);

  useEffect(() => {
    if (!credentials.some(credential => credential.id === credentialId)) {
      setCredentialId(credentials[0]?.id ?? '');
    }
  }, [credentialId, credentials]);

  const addParameter = useCallback((kind: 'query' | 'headers') => {
    const next = { id: nextParameterId.current++, name: '', value: '' };
    if (kind === 'query') setQuery(current => [...current, next]);
    else setHeaders(current => [...current, next]);
  }, []);

  const updateParameter = useCallback((
    kind: 'query' | 'headers',
    id: number,
    field: 'name' | 'value',
    value: string,
  ) => {
    const update = (items: EditableParameter[]) => items.map(item =>
      item.id === id ? { ...item, [field]: value } : item);
    if (kind === 'query') setQuery(update);
    else setHeaders(update);
  }, []);

  const removeParameter = useCallback((kind: 'query' | 'headers', id: number) => {
    if (kind === 'query') setQuery(current => current.filter(item => item.id !== id));
    else setHeaders(current => current.filter(item => item.id !== id));
  }, []);

  const authentication = useCallback((): PlaygroundAuthentication => {
    if (requirement.type === 'apiKey') return { type: 'apiKey', value: apiKey };
    if (requirement.type !== 'oauth') return { type: 'none' };
    if (oauthMode === 'bearerToken') return { type: 'bearerToken', token: bearerToken };
    if (oauthMode === 'jwtBearer') return { type: 'jwtBearer', assertion, scope };
    return { type: 'clientCredentials', consumerKey, consumerSecret, scope };
  }, [apiKey, assertion, bearerToken, consumerKey, consumerSecret, oauthMode, requirement.type, scope]);

  const canExecute = Boolean(selectedOperation && selectedDeployment)
    && pathNames.every(name => pathValues[name])
    && requirement.type !== 'mtls'
    && requirement.type !== 'unsupported'
    && (requirement.type !== 'apiKey' || Boolean(apiKey))
    && (requirement.type !== 'oauth'
      || (oauthMode === 'bearerToken' && Boolean(bearerToken))
      || (oauthMode === 'jwtBearer' && Boolean(assertion))
      || (oauthMode === 'clientCredentials' && Boolean(consumerKey && consumerSecret)));

  const runRequest = useCallback(async () => {
    if (!selectedOperation || !selectedDeployment || !canExecute) return;
    setExecuting(true);
    setError('');
    setResult(null);
    try {
      const nextResult = await executePlayground({
        proxyId,
        deploymentId: selectedDeployment.id,
        operationId: selectedOperation.operationId,
        pathParameters: pathValues,
        queryParameters: query.filter(item => item.name).map(({ name, value }) => ({ name, value })),
        headers: headers.filter(item => item.name).map(({ name, value }) => ({ name, value })),
        ...(body ? { body } : {}),
        authentication: authentication(),
      });
      setResult(nextResult);
      setResponseView('body');
    } catch (cause) {
      setError(cause instanceof PlaygroundApiError ? cause.message : 'Request could not be completed');
    } finally {
      setExecuting(false);
    }
  }, [authentication, body, canExecute, deploymentId, headers, pathValues, proxyId, query, selectedDeployment, selectedOperation]);

  const copyCurl = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.request.curl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [result]);

  const mtlsCurl = `${[
    'curl',
    `  --request ${selectedOperation?.method.toUpperCase() ?? 'GET'}`,
    `  '${target}'`,
    "  --cacert '.local-secrets/pki/authorities/local-development/ca.crt'",
    "  --cert '<client.crt>'",
    "  --key '<client.key>'",
  ].join(' \\\n')}`;

  return (
    <div className="playground-page">
      <header className="playground-header">
        <div>
          <span className="playground-kicker"><FlaskConical /> Runtime client</span>
          <h1>Proxy playground</h1>
          <p>Compose and execute a request against an active proxy deployment.</p>
        </div>
        <span className="playground-safety"><ShieldCheck /> Requests constrained to deployed routes</span>
      </header>

      <section className="playground-selector" aria-label="Request target">
        <CatalogCombobox
          label="Proxy"
          value={proxyId}
          options={proxyOptions}
          onChange={setProxyId}
          disabled={loading}
          searchPlaceholder="Search proxy or organization"
        />
        <CatalogCombobox
          label="Environment"
          value={deploymentId}
          options={deploymentOptions}
          onChange={setDeploymentId}
          disabled={loading || deploymentOptions.length === 0}
          searchPlaceholder="Search stage or region"
        />
        <CatalogCombobox
          label="Operation"
          value={operationId}
          options={operationOptions}
          onChange={setOperationId}
          disabled={loading || operationOptions.length === 0}
          searchPlaceholder="Search method, path, or policy"
        />
      </section>

      {error && <div className="playground-error" role="alert">{error}</div>}
      {!loading && proxies.length === 0 && (
        <div className="playground-empty">
          <FlaskConical />
          <h2>No active proxy deployments</h2>
          <p>Deploy an active proxy revision before composing a runtime request.</p>
        </div>
      )}

      {proxies.length > 0 && (
        <div className="playground-workbench">
          <section className="request-composer" aria-labelledby="request-composer-title">
            <header>
              <div><span>Request</span><h2 id="request-composer-title">Composer</h2></div>
              <span className="revision-stamp">rev {revision?.revisionNumber ?? '—'}</span>
            </header>

            <div className="request-target-bar">
              <span className={`method method-${selectedOperation?.method ?? 'get'}`}>
                {selectedOperation?.method.toUpperCase() ?? '—'}
              </span>
              <code>{target}</code>
            </div>

            {pathNames.length > 0 && (
              <PlaygroundSection title="Path parameters" detail="Required by the selected route">
                <div className="playground-field-grid">
                  {pathNames.map(name => (
                    <label className="playground-field" key={name}>
                      <span>{name}</span>
                      <input
                        value={pathValues[name] ?? ''}
                        onChange={event => setPathValues(current => ({
                          ...current,
                          [name]: event.target.value,
                        }))}
                        placeholder={`Value for {${name}}`}
                      />
                    </label>
                  ))}
                </div>
              </PlaygroundSection>
            )}

            <ParameterSection
              title="Query parameters"
              detail="Appended to the deployed route"
              parameters={query}
              onAdd={() => addParameter('query')}
              onChange={(id, field, value) => updateParameter('query', id, field, value)}
              onRemove={id => removeParameter('query', id)}
            />

            <ParameterSection
              title="Headers"
              detail="Host and platform identity headers are protected"
              parameters={headers}
              onAdd={() => addParameter('headers')}
              onChange={(id, field, value) => updateParameter('headers', id, field, value)}
              onRemove={id => removeParameter('headers', id)}
            />

            {selectedOperation && operationSupportsBody(selectedOperation) && (
              <PlaygroundSection title="Body" detail="Sent without schema validation">
                <label className="playground-field playground-body-field">
                  <span className="sr-only">Request body</span>
                  <textarea
                    value={body}
                    onChange={event => setBody(event.target.value)}
                    placeholder={'{\n  "example": true\n}'}
                    rows={8}
                    spellCheck={false}
                  />
                </label>
              </PlaygroundSection>
            )}

            <PlaygroundSection title="Authorization" detail={<RequirementLabel requirement={requirement} />}>
              <AuthenticationEditor
                requirement={requirement}
                credentials={credentials}
                credentialId={credentialId}
                onCredentialChange={setCredentialId}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
                oauthMode={oauthMode}
                onOauthModeChange={setOauthMode}
                consumerKey={consumerKey}
                onConsumerKeyChange={setConsumerKey}
                consumerSecret={consumerSecret}
                onConsumerSecretChange={setConsumerSecret}
                scope={scope}
                onScopeChange={setScope}
                bearerToken={bearerToken}
                onBearerTokenChange={setBearerToken}
                assertion={assertion}
                onAssertionChange={setAssertion}
                mtlsCurl={mtlsCurl}
              />
            </PlaygroundSection>

            <footer className="playground-execute-row">
              <span>{selectedDeployment?.environment.publicOrigin ?? 'No active deployment selected'}</span>
              <button
                className="primary-command playground-send"
                type="button"
                onClick={() => void runRequest()}
                disabled={!canExecute || executing}
              >
                <Send />
                {executing ? 'Sending request' : 'Send request'}
              </button>
            </footer>
          </section>

          <section className="response-inspector" aria-labelledby="response-inspector-title">
            <header>
              <div><span>Response</span><h2 id="response-inspector-title">Inspector</h2></div>
              {result && (
                <span className={`response-status response-${methodTone(result.response.status)}`}>
                  {result.response.status} {result.response.statusText}
                </span>
              )}
            </header>

            {result ? (
              <>
                <div className="response-facts">
                  <span><Clock3 /> {result.response.durationMs} ms</span>
                  <span><Braces /> {new Blob([result.response.body]).size} bytes</span>
                  {result.tokenExchange && <span><KeyRound /> Token {result.tokenExchange.durationMs} ms</span>}
                  {result.response.truncated && <span>Body truncated</span>}
                </div>
                <div className="response-tabs" role="tablist" aria-label="Response detail">
                  {(['body', 'headers', 'request'] as const).map(view => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={responseView === view}
                      onClick={() => setResponseView(view)}
                      key={view}
                    >
                      {view}
                    </button>
                  ))}
                  <button
                    className="copy-response-command"
                    type="button"
                    onClick={() => void copyCurl()}
                    title="Copy redacted cURL"
                    aria-label="Copy redacted cURL"
                  >
                    {copied ? <Check /> : <Copy />}
                  </button>
                </div>
                <pre className="response-output">
                  {responseView === 'body'
                    ? prettyBody(result)
                    : responseView === 'headers'
                      ? JSON.stringify(result.response.headers, null, 2)
                      : result.request.curl}
                </pre>
              </>
            ) : (
              <div className="response-placeholder">
                <Terminal />
                <h3>Ready for a request</h3>
                <p>The gateway response, timing, headers and redacted request will appear here.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PlaygroundSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="playground-form-section">
      <header><h3>{title}</h3><span>{detail}</span></header>
      {children}
    </section>
  );
}

function ParameterSection({
  title,
  detail,
  parameters,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  detail: string;
  parameters: EditableParameter[];
  onAdd(): void;
  onChange(id: number, field: 'name' | 'value', value: string): void;
  onRemove(id: number): void;
}) {
  return (
    <PlaygroundSection title={title} detail={detail}>
      <div className="parameter-editor">
        {parameters.map(parameter => (
          <div className="parameter-row" key={parameter.id}>
            <input
              aria-label={`${title} name`}
              value={parameter.name}
              onChange={event => onChange(parameter.id, 'name', event.target.value)}
              placeholder="Name"
            />
            <input
              aria-label={`${title} value`}
              value={parameter.value}
              onChange={event => onChange(parameter.id, 'value', event.target.value)}
              placeholder="Value"
            />
            <button
              type="button"
              onClick={() => onRemove(parameter.id)}
              aria-label={`Remove ${title.toLowerCase()} row`}
              title="Remove row"
            >
              <Trash2 />
            </button>
          </div>
        ))}
        {parameters.length === 0 && <p>No values added.</p>}
        <button className="parameter-add-command" type="button" onClick={onAdd}>
          <Plus /> Add value
        </button>
      </div>
    </PlaygroundSection>
  );
}

function RequirementLabel({ requirement }: { requirement: PlaygroundAuthenticationRequirement }) {
  if (requirement.type === 'apiKey') return <>API key · <code>{requirement.header}</code></>;
  if (requirement.type === 'oauth') {
    return <>OAuth access token{requirement.requiredScopes.length > 0 ? ` · ${requirement.requiredScopes.join(' ')}` : ''}</>;
  }
  if (requirement.type === 'mtls') return <>Client certificate required</>;
  if (requirement.type === 'unsupported') return <>{requirement.policyType} is not executable here</>;
  return <>No authentication policy</>;
}

function AuthenticationEditor({
  requirement,
  credentials,
  credentialId,
  onCredentialChange,
  apiKey,
  onApiKeyChange,
  oauthMode,
  onOauthModeChange,
  consumerKey,
  onConsumerKeyChange,
  consumerSecret,
  onConsumerSecretChange,
  scope,
  onScopeChange,
  bearerToken,
  onBearerTokenChange,
  assertion,
  onAssertionChange,
  mtlsCurl,
}: {
  requirement: PlaygroundAuthenticationRequirement;
  credentials: Array<AppCredential & { appName: string }>;
  credentialId: string;
  onCredentialChange(value: string): void;
  apiKey: string;
  onApiKeyChange(value: string): void;
  oauthMode: OAuthMode;
  onOauthModeChange(value: OAuthMode): void;
  consumerKey: string;
  onConsumerKeyChange(value: string): void;
  consumerSecret: string;
  onConsumerSecretChange(value: string): void;
  scope: string;
  onScopeChange(value: string): void;
  bearerToken: string;
  onBearerTokenChange(value: string): void;
  assertion: string;
  onAssertionChange(value: string): void;
  mtlsCurl: string;
}) {
  if (requirement.type === 'none') {
    return <div className="authentication-none"><ShieldCheck /> This operation can be called without client authentication.</div>;
  }
  if (requirement.type === 'mtls') {
    return (
      <div className="mtls-playground-callout">
        <FileKey2 />
        <div>
          <strong>Run this request from the certificate owner</strong>
          <p>The platform never receives the client private key. Replace the certificate paths locally.</p>
          <pre>{mtlsCurl}</pre>
        </div>
      </div>
    );
  }
  if (requirement.type === 'unsupported') {
    return <div className="authentication-none">This system operation is not available in the business proxy playground.</div>;
  }
  const credentialOptions = (
    <label className="playground-field">
      <span>Application credential</span>
      <select value={credentialId} onChange={event => onCredentialChange(event.target.value)}>
        <option value="">Enter manually</option>
        {credentials.map(credential => (
          <option value={credential.id} key={credential.id}>
            {credential.appName} · {credential.consumerKey}
          </option>
        ))}
      </select>
    </label>
  );
  if (requirement.type === 'apiKey') {
    return (
      <div className="playground-field-grid">
        {credentialOptions}
        <label className="playground-field">
          <span>API key</span>
          <input value={apiKey} onChange={event => onApiKeyChange(event.target.value)} autoComplete="off" />
        </label>
      </div>
    );
  }
  return (
    <div className="oauth-editor">
      <div className="oauth-mode-switch" aria-label="OAuth credential mode">
        <button type="button" aria-pressed={oauthMode === 'clientCredentials'} onClick={() => onOauthModeChange('clientCredentials')}>Client credentials</button>
        <button type="button" aria-pressed={oauthMode === 'bearerToken'} onClick={() => onOauthModeChange('bearerToken')}>Access token</button>
        <button type="button" aria-pressed={oauthMode === 'jwtBearer'} onClick={() => onOauthModeChange('jwtBearer')}>JWT assertion</button>
      </div>
      {oauthMode === 'clientCredentials' && (
        <div className="playground-field-grid">
          {credentialOptions}
          <label className="playground-field"><span>Consumer key</span><input value={consumerKey} onChange={event => onConsumerKeyChange(event.target.value)} /></label>
          <label className="playground-field"><span>Consumer secret</span><input type="password" value={consumerSecret} onChange={event => onConsumerSecretChange(event.target.value)} autoComplete="off" /></label>
          <label className="playground-field"><span>Scope</span><input value={scope} onChange={event => onScopeChange(event.target.value)} /></label>
        </div>
      )}
      {oauthMode === 'bearerToken' && (
        <label className="playground-field playground-body-field"><span>Access token</span><textarea rows={5} value={bearerToken} onChange={event => onBearerTokenChange(event.target.value)} spellCheck={false} /></label>
      )}
      {oauthMode === 'jwtBearer' && (
        <div className="playground-field-grid">
          <label className="playground-field playground-body-field"><span>Signed JWT assertion</span><textarea rows={5} value={assertion} onChange={event => onAssertionChange(event.target.value)} spellCheck={false} /></label>
          <label className="playground-field"><span>Scope</span><input value={scope} onChange={event => onScopeChange(event.target.value)} /></label>
        </div>
      )}
      <p className="playground-secret-note">Secrets and tokens are used for this request only and are never returned in the response.</p>
    </div>
  );
}
