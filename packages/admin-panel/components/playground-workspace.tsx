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
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  managementFetch,
  type ApiProxyDetail,
  type ApiProxySummary,
  type AppCredential,
  type DeveloperApp,
  type Organization,
  type ProxyDeployment,
  type ProxyOperation,
  type ProxyRevisionDetail,
} from '@/lib/api-client';
import {
  authenticationRequirement,
  buildPlaygroundCurl,
  operationSupportsBody,
  parsePlaygroundTarget,
  type PlaygroundAuthentication,
  type PlaygroundAuthenticationRequirement,
  type PlaygroundParameter,
} from '@/lib/playground';
import { executePlayground, PlaygroundApiError } from '@/lib/playground-api';
import type { PlaygroundExecutionResult } from '@/lib/playground-service';
import { environmentLabel } from '@/lib/proxy-control';
import { CatalogCombobox, type CatalogOption } from '@/components/catalog-combobox';

type OAuthMode = 'clientCredentials' | 'bearerToken' | 'jwtBearer';
type ResponseView = 'preview' | 'body' | 'headers' | 'request';
interface EditableParameter extends PlaygroundParameter { id: number }

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
}

function activeCredentials(
  apps: DeveloperApp[],
  productIds: Set<string>,
  allowAnyProduct = false,
): Array<AppCredential & { appName: string }> {
  return apps.flatMap(app => app.status === 'approved'
    ? app.credentials
        .filter(credential => credential.status === 'approved'
          && (!credential.expiresAt || new Date(credential.expiresAt) > new Date())
          && credential.productGrants.some(grant =>
            grant.status === 'approved'
            && (allowAnyProduct || productIds.has(grant.product.id))))
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

const deploymentStageOrder = { qual: 0, pprod: 1, prod: 2 } as const;

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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [credentialOrganizationId, setCredentialOrganizationId] = useState('');
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<EditableParameter[]>([]);
  const [headers, setHeaders] = useState<EditableParameter[]>([]);
  const [body, setBody] = useState('');
  const [bodyMediaType, setBodyMediaType] = useState('application/json');
  const [bodyExampleName, setBodyExampleName] = useState('');
  const [bodyDirty, setBodyDirty] = useState(false);
  const [bodyError, setBodyError] = useState('');
  const [manualTarget, setManualTarget] = useState('');
  const [targetError, setTargetError] = useState('');
  const [oauthMode, setOauthMode] = useState<OAuthMode>('clientCredentials');
  const [credentialId, setCredentialId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [scope, setScope] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [assertion, setAssertion] = useState('');
  const [result, setResult] = useState<PlaygroundExecutionResult | null>(null);
  const [responseView, setResponseView] = useState<ResponseView>('preview');
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
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
    () => activeCredentials(
      apps,
      new Set(proxy?.products.map(product => product.id) ?? []),
      proxy?.systemManaged,
    ),
    [apps, proxy],
  );
  const pathNames = useMemo(
    () => selectedOperation ? pathParameterNames(selectedOperation.path) : [],
    [selectedOperation],
  );
  const generatedTarget = useMemo(
    () => previewTarget(selectedDeployment, revision, selectedOperation, pathValues, query),
    [pathValues, query, revision, selectedDeployment, selectedOperation],
  );
  const target = manualTarget || generatedTarget;
  const proxyOptions = useMemo<CatalogOption[]>(() => [...proxies]
    .sort((left, right) => Number(left.systemManaged) - Number(right.systemManaged)
      || left.name.localeCompare(right.name))
    .map(item => ({
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
  const organizationOptions = useMemo<CatalogOption[]>(() => organizations.map(organization => ({
    value: organization.id,
    label: organization.name,
    description: organization.id,
  })), [organizations]);
  const selectedRequestBody = useMemo(
    () => selectedOperation?.requestBodies.find(item => item.mediaType === bodyMediaType)
      ?? selectedOperation?.requestBodies[0]
      ?? null,
    [bodyMediaType, selectedOperation],
  );
  const selectedBodyExample = useMemo(
    () => selectedRequestBody?.examples.find(example => example.name === bodyExampleName)
      ?? selectedRequestBody?.examples[0]
      ?? null,
    [bodyExampleName, selectedRequestBody],
  );
  const bodyMediaOptions = useMemo<CatalogOption[]>(() =>
    selectedOperation?.requestBodies.map(item => ({
      value: item.mediaType,
      label: item.mediaType,
      description: item.required ? 'Required by OpenAPI' : 'Optional body',
    })) ?? [], [selectedOperation]);
  const bodyExampleOptions = useMemo<CatalogOption[]>(() =>
    selectedRequestBody?.examples.map(example => ({
      value: example.name,
      label: example.name,
      description: example.source === 'explicit' ? 'OpenAPI example' : 'Generated from schema',
    })) ?? [], [selectedRequestBody]);

  useEffect(() => {
    Promise.all([
      managementFetch<ApiProxySummary[]>('proxies'),
      managementFetch<Organization[]>('organizations'),
    ])
      .then(([items, nextOrganizations]) => {
        const executable = items.filter(item => item.active
          && item.deployments.length > 0
          && (!item.systemManaged || item.id === 'proxy-platform-oauth'));
        setProxies(executable);
        setOrganizations(nextOrganizations);
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
    ]).then(([nextProxy, allDeployments]) => {
      const active = allDeployments
        .filter(deployment => deployment.status === 'active')
        .sort((left, right) => deploymentStageOrder[left.environment.stage]
          - deploymentStageOrder[right.environment.stage]
          || left.environment.region.localeCompare(right.environment.region));
      setProxy(nextProxy);
      setDeployments(active);
      setDeploymentId(active[0]?.id ?? '');
      setResult(null);
    }).catch(cause => {
      if (cause.name !== 'AbortError') setError(cause.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [proxyId]);

  useEffect(() => {
    if (!proxy) {
      setCredentialOrganizationId('');
      return;
    }
    if (!proxy.systemManaged) {
      setCredentialOrganizationId(proxy.organizationId);
      return;
    }
    setCredentialOrganizationId(current =>
      organizations.some(organization => organization.id === current)
        ? current
        : organizations.find(organization => organization.id !== proxy.organizationId)?.id
          ?? organizations[0]?.id
          ?? '');
  }, [organizations, proxy]);

  useEffect(() => {
    if (!credentialOrganizationId) {
      setApps([]);
      return;
    }
    const controller = new AbortController();
    managementFetch<DeveloperApp[]>(
      `organizations/${credentialOrganizationId}/apps`,
      { signal: controller.signal },
    ).then(setApps).catch(cause => {
      if (cause.name !== 'AbortError') setError(cause.message);
    });
    return () => controller.abort();
  }, [credentialOrganizationId]);

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
    const firstRequestBody = selectedOperation?.requestBodies[0];
    const firstExample = firstRequestBody?.examples[0];
    setBody(firstExample?.body ?? '');
    setBodyMediaType(firstRequestBody?.mediaType ?? 'application/json');
    setBodyExampleName(firstExample?.name ?? '');
    setBodyDirty(false);
    setBodyError('');
    setManualTarget('');
    setTargetError('');
    setConsumerSecret('');
    setBearerToken('');
    setAssertion('');
    setResult(null);
    setResponseView('preview');
    if (requirement.type === 'oauth') {
      setScope(requirement.requiredScopes.join(' '));
      setOauthMode('clientCredentials');
    } else if (requirement.type === 'oauthToken') {
      setScope('');
      setOauthMode(requirement.grantTypes.includes('client_credentials')
        ? 'clientCredentials'
        : 'jwtBearer');
    } else {
      setScope('');
    }
  }, [operationId, pathNames.join('|'), requirement.type, selectedOperation]);

  const validateBody = useCallback((value: string, mediaType: string) => {
    if (!value || !mediaType.toLowerCase().includes('json')) {
      setBodyError('');
      return;
    }
    try {
      JSON.parse(value);
      setBodyError('');
    } catch {
      setBodyError('Body must contain valid JSON for the selected media type.');
    }
  }, []);

  const selectBodyMediaType = useCallback((mediaType: string) => {
    const requestBody = selectedOperation?.requestBodies.find(item => item.mediaType === mediaType);
    const example = requestBody?.examples[0];
    setBodyMediaType(mediaType);
    setBodyExampleName(example?.name ?? '');
    setBody(example?.body ?? '');
    setBodyDirty(false);
    setBodyError('');
  }, [selectedOperation]);

  const selectBodyExample = useCallback((name: string) => {
    const example = selectedRequestBody?.examples.find(item => item.name === name);
    if (!example) return;
    setBodyExampleName(name);
    setBody(example.body);
    setBodyDirty(false);
    setBodyError('');
  }, [selectedRequestBody]);

  useEffect(() => {
    const selected = credentials.find(credential => credential.id === credentialId);
    if (!selected) return;
    setApiKey(selected.consumerKey);
    setConsumerKey(selected.consumerKey);
    if (requirement.type === 'oauthToken') {
      const allowed = new Set(requirement.allowedScopes);
      const grantScopes = selected.productGrants
        .filter(grant => grant.status === 'approved')
        .flatMap(grant => grant.scopes)
        .filter(scopeName => allowed.size === 0 || allowed.has(scopeName));
      setScope([...new Set(grantScopes)].join(' '));
    }
  }, [credentialId, credentials, requirement]);

  useEffect(() => {
    if (credentialId && !credentials.some(credential => credential.id === credentialId)) {
      setCredentialId('');
    }
  }, [credentialId, credentials]);

  const addParameter = useCallback((kind: 'query' | 'headers') => {
    const next = { id: nextParameterId.current++, name: '', value: '' };
    if (kind === 'query') {
      setQuery(current => [...current, next]);
      setManualTarget('');
      setTargetError('');
    }
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
    if (kind === 'query') {
      setQuery(update);
      setManualTarget('');
      setTargetError('');
    }
    else setHeaders(update);
  }, []);

  const removeParameter = useCallback((kind: 'query' | 'headers', id: number) => {
    if (kind === 'query') {
      setQuery(current => current.filter(item => item.id !== id));
      setManualTarget('');
      setTargetError('');
    }
    else setHeaders(current => current.filter(item => item.id !== id));
  }, []);

  const applyEditedTarget = useCallback(() => {
    if (!manualTarget || !selectedDeployment || !revision || !selectedOperation) return;
    try {
      const parsed = parsePlaygroundTarget(
        manualTarget,
        selectedDeployment.environment.publicOrigin,
        revision.basePath,
        selectedOperation.path,
      );
      setPathValues(parsed.pathParameters);
      setQuery(parsed.queryParameters.map(parameter => ({
        ...parameter,
        id: nextParameterId.current++,
      })));
      setManualTarget('');
      setTargetError('');
    } catch (cause) {
      setTargetError(cause instanceof Error ? cause.message : 'Request URL is not valid');
    }
  }, [manualTarget, revision, selectedDeployment, selectedOperation]);

  const authentication = useCallback((): PlaygroundAuthentication => {
    if (requirement.type === 'apiKey') return { type: 'apiKey', value: apiKey };
    if (requirement.type !== 'oauth' && requirement.type !== 'oauthToken') return { type: 'none' };
    if (oauthMode === 'bearerToken') return { type: 'bearerToken', token: bearerToken };
    if (oauthMode === 'jwtBearer') return { type: 'jwtBearer', assertion, scope };
    return { type: 'clientCredentials', consumerKey, consumerSecret, scope };
  }, [apiKey, assertion, bearerToken, consumerKey, consumerSecret, oauthMode, requirement.type, scope]);

  const canExecute = Boolean(selectedOperation && selectedDeployment)
    && pathNames.every(name => pathValues[name])
    && !targetError
    && !bodyError
    && (requirement.type === 'oauthToken' || !selectedRequestBody?.required || Boolean(body))
    && requirement.type !== 'mtls'
    && requirement.type !== 'unsupported'
    && (requirement.type !== 'apiKey' || Boolean(apiKey))
    && (requirement.type !== 'oauth' && requirement.type !== 'oauthToken'
      || (oauthMode === 'bearerToken' && Boolean(bearerToken))
      || (oauthMode === 'jwtBearer' && Boolean(assertion))
      || (oauthMode === 'clientCredentials' && Boolean(consumerKey && consumerSecret)));

  const runRequest = useCallback(async () => {
    if (!selectedOperation || !selectedDeployment || !canExecute) return;
    if (manualTarget && revision) {
      try {
        parsePlaygroundTarget(
          manualTarget,
          selectedDeployment.environment.publicOrigin,
          revision.basePath,
          selectedOperation.path,
        );
      } catch (cause) {
        setTargetError(cause instanceof Error ? cause.message : 'Request URL is not valid');
        return;
      }
    }
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
        targetUrl: target,
        ...(body ? { body } : {}),
        ...(body ? { bodyMediaType } : {}),
        authentication: authentication(),
      });
      setResult(nextResult);
      setResponseView('body');
    } catch (cause) {
      setError(cause instanceof PlaygroundApiError ? cause.message : 'Request could not be completed');
    } finally {
      setExecuting(false);
    }
  }, [authentication, body, bodyMediaType, canExecute, headers, manualTarget, pathValues, proxyId, query, revision, selectedDeployment, selectedOperation, target]);

  const requestPreview = useMemo(() => {
    if (!selectedOperation || !selectedDeployment) return 'Select an active operation';
    const previewHeaders = Object.fromEntries(headers
      .filter(item => item.name)
      .map(item => [item.name.toLowerCase(), item.value]));
    previewHeaders.accept ??= 'application/json';
    let previewBody = body;
    if (requirement.type === 'oauthToken') {
      previewHeaders['content-type'] = 'application/x-www-form-urlencoded';
      const tokenForm = new URLSearchParams();
      if (oauthMode === 'clientCredentials') {
        tokenForm.set('grant_type', 'client_credentials');
        previewHeaders.authorization = 'Basic <redacted>';
      } else {
        tokenForm.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        tokenForm.set('assertion', '<redacted>');
      }
      if (scope) tokenForm.set('scope', scope);
      previewBody = tokenForm.toString();
    } else if (body && operationSupportsBody(selectedOperation)) {
      previewHeaders['content-type'] ??= bodyMediaType;
    }
    if (requirement.type === 'apiKey') {
      previewHeaders[requirement.header.toLowerCase()] = '<redacted>';
    } else if (requirement.type === 'oauth') {
      previewHeaders.authorization = oauthMode === 'bearerToken'
        ? 'Bearer <redacted>'
        : 'Bearer <issued-access-token>';
    }
    try {
      return buildPlaygroundCurl({
        method: selectedOperation.method,
        url: target,
        headers: previewHeaders,
        ...(previewBody ? { body: previewBody } : {}),
      });
    } catch {
      return `${selectedOperation.method.toUpperCase()} ${target}\n\nComplete a valid absolute URL to preview the request.`;
    }
  }, [body, bodyMediaType, headers, oauthMode, requirement, scope, selectedDeployment, selectedOperation, target]);

  const issuedAccessToken = useMemo(() => {
    if (requirement.type !== 'oauthToken' || !result?.response.body) return '';
    try {
      const payload = JSON.parse(result.response.body) as { access_token?: unknown };
      return typeof payload.access_token === 'string' ? payload.access_token : '';
    } catch {
      return '';
    }
  }, [requirement.type, result]);

  const copyAccessToken = useCallback(async () => {
    if (!issuedAccessToken) return;
    await navigator.clipboard.writeText(issuedAccessToken);
    setTokenCopied(true);
    window.setTimeout(() => setTokenCopied(false), 1400);
  }, [issuedAccessToken]);

  const copyDisplayedRequest = useCallback(async () => {
    const value = responseView === 'request' && result
      ? result.request.curl
      : requestPreview;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [requestPreview, responseView, result]);

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
              <input
                aria-label="Request URL"
                value={target}
                onChange={event => {
                  setManualTarget(event.target.value);
                  setTargetError('');
                }}
                onBlur={applyEditedTarget}
                spellCheck={false}
              />
              <button
                type="button"
                title="Restore generated URL"
                aria-label="Restore generated URL"
                onClick={() => {
                  setManualTarget('');
                  setTargetError('');
                }}
              >
                <RotateCcw />
              </button>
            </div>
            {targetError && <p className="request-target-error" role="alert">{targetError}</p>}

            {pathNames.length > 0 && (
              <PlaygroundSection title="Path parameters" detail="Required by the selected route">
                <div className="playground-field-grid">
                  {pathNames.map(name => (
                    <label className="playground-field" key={name}>
                      <span>{name}</span>
                      <input
                        value={pathValues[name] ?? ''}
                        onChange={event => {
                          setPathValues(current => ({
                            ...current,
                            [name]: event.target.value,
                          }));
                          setManualTarget('');
                          setTargetError('');
                        }}
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

            {selectedOperation && operationSupportsBody(selectedOperation) && requirement.type !== 'oauthToken' && (
              <PlaygroundSection
                title="Body"
                detail={selectedRequestBody
                  ? `${selectedRequestBody.required ? 'Required' : 'Optional'} · OpenAPI contract`
                  : 'Freeform · no OpenAPI request body'}
              >
                {bodyMediaOptions.length > 0 && (
                  <div className="body-example-toolbar">
                    <CatalogCombobox
                      label="Media type"
                      value={bodyMediaType}
                      options={bodyMediaOptions}
                      onChange={selectBodyMediaType}
                      searchPlaceholder="Search media type"
                    />
                    {bodyExampleOptions.length > 0 && (
                      <CatalogCombobox
                        label="Example"
                        value={bodyExampleName}
                        options={bodyExampleOptions}
                        onChange={selectBodyExample}
                        searchPlaceholder="Search example"
                      />
                    )}
                    <button
                      className="body-example-reset"
                      type="button"
                      onClick={() => selectedBodyExample && selectBodyExample(selectedBodyExample.name)}
                      disabled={!selectedBodyExample || !bodyDirty}
                      title="Restore selected example"
                      aria-label="Restore selected body example"
                    >
                      <RotateCcw />
                    </button>
                  </div>
                )}
                <label className="playground-field playground-body-field">
                  <span className="sr-only">Request body</span>
                  <textarea
                    value={body}
                    onChange={event => {
                      setBody(event.target.value);
                      setBodyDirty(true);
                      validateBody(event.target.value, bodyMediaType);
                    }}
                    placeholder={'{\n  "example": true\n}'}
                    rows={8}
                    spellCheck={false}
                  />
                </label>
                {bodyError && <p className="body-validation-error" role="alert">{bodyError}</p>}
              </PlaygroundSection>
            )}

            <PlaygroundSection title="Authorization" detail={<RequirementLabel requirement={requirement} />}>
              <AuthenticationEditor
                requirement={requirement}
                credentials={credentials}
                organizationOptions={organizationOptions}
                credentialOrganizationId={credentialOrganizationId}
                onCredentialOrganizationChange={setCredentialOrganizationId}
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
              <div><span>Exchange</span><h2 id="response-inspector-title">Inspector</h2></div>
              {result && (
                <span className={`response-status response-${methodTone(result.response.status)}`}>
                  {result.response.status} {result.response.statusText}
                </span>
              )}
            </header>

            {result && (
              <div className="response-facts">
                <span><Clock3 /> {result.response.durationMs} ms</span>
                <span><Braces /> {new Blob([result.response.body]).size} bytes</span>
                {result.tokenExchange && <span><KeyRound /> Token {result.tokenExchange.durationMs} ms</span>}
                {result.response.truncated && <span>Body truncated</span>}
                {issuedAccessToken && (
                  <button type="button" onClick={() => void copyAccessToken()}>
                    {tokenCopied ? <Check /> : <Copy />}
                    {tokenCopied ? 'Token copied' : 'Copy access token'}
                  </button>
                )}
              </div>
            )}
            <div className="response-tabs" role="tablist" aria-label="Request and response detail">
              {(['preview', ...(result ? ['body', 'headers', 'request'] as const : [])] as ResponseView[]).map(view => (
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
                onClick={() => void copyDisplayedRequest()}
                title="Copy displayed request"
                aria-label="Copy displayed request"
              >
                {copied ? <Check /> : <Copy />}
              </button>
            </div>
            <pre className="response-output">
              {responseView === 'preview' || !result
                ? requestPreview
                : responseView === 'body'
                  ? prettyBody(result)
                  : responseView === 'headers'
                    ? JSON.stringify(result.response.headers, null, 2)
                    : result.request.curl}
            </pre>
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
  if (requirement.type === 'oauthToken') return <>OAuth token issuance</>;
  if (requirement.type === 'jwks') return <>Public signing keys</>;
  if (requirement.type === 'mtls') return <>Client certificate required</>;
  if (requirement.type === 'unsupported') return <>{requirement.policyType} is not executable here</>;
  return <>No authentication policy</>;
}

function AuthenticationEditor({
  requirement,
  credentials,
  organizationOptions,
  credentialOrganizationId,
  onCredentialOrganizationChange,
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
  organizationOptions: CatalogOption[];
  credentialOrganizationId: string;
  onCredentialOrganizationChange(value: string): void;
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
  if (requirement.type === 'jwks') {
    return <div className="authentication-none"><KeyRound /> This endpoint publishes the gateway public signing keys.</div>;
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
    <CatalogCombobox
      label="Application credential"
      value={credentialId}
      options={[
        { value: '', label: 'Enter manually', description: 'Do not use a saved consumer key' },
        ...credentials.map(credential => ({
          value: credential.id,
          label: credential.appName,
          description: credential.consumerKey,
          keywords: [credential.id],
        })),
      ]}
      onChange={onCredentialChange}
      searchPlaceholder="Search app or consumer key"
    />
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
  const allowsClientCredentials = requirement.type === 'oauth'
    || requirement.grantTypes.includes('client_credentials');
  const allowsJwtBearer = requirement.type === 'oauth'
    || requirement.grantTypes.includes('urn:ietf:params:oauth:grant-type:jwt-bearer');
  const allowsAccessToken = requirement.type === 'oauth';
  return (
    <div className="oauth-editor">
      {requirement.type === 'oauthToken' && (
        <CatalogCombobox
          label="Credential organization"
          value={credentialOrganizationId}
          options={organizationOptions}
          onChange={onCredentialOrganizationChange}
          searchPlaceholder="Search organization"
        />
      )}
      <div className="oauth-mode-switch" aria-label="OAuth credential mode">
        {allowsClientCredentials && <button type="button" aria-pressed={oauthMode === 'clientCredentials'} onClick={() => onOauthModeChange('clientCredentials')}>Client credentials</button>}
        {allowsAccessToken && <button type="button" aria-pressed={oauthMode === 'bearerToken'} onClick={() => onOauthModeChange('bearerToken')}>Access token</button>}
        {allowsJwtBearer && <button type="button" aria-pressed={oauthMode === 'jwtBearer'} onClick={() => onOauthModeChange('jwtBearer')}>JWT assertion</button>}
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
          {credentialOptions}
          <label className="playground-field playground-body-field"><span>Signed JWT assertion</span><textarea rows={5} value={assertion} onChange={event => onAssertionChange(event.target.value)} spellCheck={false} /></label>
          <label className="playground-field"><span>Scope</span><input value={scope} onChange={event => onScopeChange(event.target.value)} /></label>
        </div>
      )}
      <p className="playground-secret-note">
        {requirement.type === 'oauthToken'
          ? 'Credential material is used for this exchange only. A successful access token remains visible so it can be tested manually.'
          : 'Secrets and tokens are used for this request only and are never returned in diagnostics.'}
      </p>
    </div>
  );
}
