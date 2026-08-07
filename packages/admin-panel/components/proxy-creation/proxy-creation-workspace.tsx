'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowIcon, CloseIcon, ProxyIcon } from '@/components/gateway-icons';
import { CreationStepNav } from '@/components/proxy-creation/creation-step-nav';
import { DefinitionStep } from '@/components/proxy-creation/definition-step';
import { IdentityStep } from '@/components/proxy-creation/identity-step';
import { ReviewStep } from '@/components/proxy-creation/review-step';
import { RoutingStep } from '@/components/proxy-creation/routing-step';
import { useAdminSession } from '@/components/session-context';
import { managementFetch, type Organization } from '@/lib/api-client';
import { canManageOrganization } from '@/lib/proxy-control';
import {
  applyOpenApiInspection,
  emptyProxyCreationDraft,
  hydrateGatewaySource,
  MAX_PROXY_SOURCE_BYTES,
  serializeGatewayConfiguration,
  sourceByteLength,
  validateRoutingDraft,
  type EditablePolicy,
  type OpenApiOperationDraft,
  type ProxyConfigurationValidation,
  type ProxyCreationDraft,
} from '@/lib/proxy-creation';
import {
  createConfiguredProxy,
  describeProxyCreationFailure,
  validateProxyConfiguration,
} from '@/lib/proxy-creation-api';

interface PendingGatewayImport {
  source: string;
  filename: string;
}

function focusFirstInvalidControl() {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"], .creation-inline-error')?.focus?.();
  });
}

export function ProxyCreationWorkspace() {
  const session = useAdminSession();
  const router = useRouter();
  const [draft, setDraft] = useState<ProxyCreationDraft>(emptyProxyCreationDraft);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [step, setStep] = useState(0);
  const [highestStep, setHighestStep] = useState(0);
  const [isLoading, setLoading] = useState(true);
  const [isBusy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [pendingGatewayImport, setPendingGatewayImport] = useState<PendingGatewayImport | null>(null);
  const [gatewayImportName, setGatewayImportName] = useState('');
  const [validation, setValidation] = useState<ProxyConfigurationValidation | null>(null);
  const [validatedGatewaySource, setValidatedGatewaySource] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    managementFetch<Organization[]>('organizations', { signal: controller.signal })
      .then(nextOrganizations => {
        const writable = nextOrganizations.filter(organization =>
          canManageOrganization(session, organization.id));
        setOrganizations(writable);
        setDraft(current => ({
          ...current,
          organizationId: current.organizationId || writable[0]?.id || '',
        }));
      })
      .catch(cause => {
        if ((cause as Error).name !== 'AbortError') setError((cause as Error).message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [session]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin
        || `${destination.pathname}${destination.search}` === `${window.location.pathname}${window.location.search}`) return;
      if (window.confirm('Discard this proxy configuration? Nothing has been saved.')) {
        setDirty(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('click', guardInternalNavigation, true);
    return () => document.removeEventListener('click', guardInternalNavigation, true);
  }, [dirty]);

  const updateDraft = useCallback((update: (current: ProxyCreationDraft) => ProxyCreationDraft) => {
    setDraft(current => update(current));
    setDirty(true);
    setHighestStep(current => Math.min(current, step));
    setValidation(null);
    setValidatedGatewaySource('');
    setError('');
  }, [step]);

  function handleFailure(cause: unknown) {
    const failure = describeProxyCreationFailure(cause);
    if (failure.step !== undefined) {
      setStep(failure.step);
      setHighestStep(failure.step);
      setValidation(null);
      setValidatedGatewaySource('');
    }
    setError(failure.message);
    focusFirstInvalidControl();
  }

  function goToStep(nextStep: number) {
    if (nextStep > highestStep) return;
    setStep(nextStep);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancel() {
    if (dirty && !window.confirm('Discard this proxy configuration? Nothing has been saved.')) return;
    setDirty(false);
    router.push('/proxies');
  }

  function advance(nextStep: number) {
    setHighestStep(current => Math.max(current, nextStep));
    setStep(nextStep);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function continueFlow() {
    if (step === 0) {
      if (!draft.organizationId || !draft.name.trim() || draft.name.trim().length > 120) {
        setError('Select an organization and provide a proxy name between 1 and 120 characters.');
        focusFirstInvalidControl();
        return;
      }
      advance(1);
      return;
    }

    if (step === 1) {
      if (!draft.openapiSource.trim()) {
        setError('Provide an OpenAPI document before continuing.');
        focusFirstInvalidControl();
        return;
      }
      if (sourceByteLength(draft.openapiSource) > MAX_PROXY_SOURCE_BYTES) {
        setError('The OpenAPI source exceeds the 5 MiB limit.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const result = await validateProxyConfiguration({
          organizationId: draft.organizationId,
          openapiSource: draft.openapiSource,
          openapiFilename: draft.openapiSourceName,
          gatewaySource: pendingGatewayImport?.source,
          gatewayFilename: pendingGatewayImport?.filename,
        });
        let nextDraft = applyOpenApiInspection(draft, result.openapi);
        if (pendingGatewayImport) {
          nextDraft = hydrateGatewaySource(nextDraft, pendingGatewayImport.source);
          setGatewayImportName(`${pendingGatewayImport.filename} · imported`);
          setPendingGatewayImport(null);
        }
        setDraft(nextDraft);
        advance(2);
      } catch (cause) {
        handleFailure(cause);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === 2) {
      const localValidation = validateRoutingDraft(draft);
      if (!localValidation.valid) {
        setError(localValidation.errors.join(' '));
        focusFirstInvalidControl();
        return;
      }
      const gatewaySource = serializeGatewayConfiguration(draft);
      setBusy(true);
      setError('');
      try {
        const result = await validateProxyConfiguration({
          organizationId: draft.organizationId,
          openapiSource: draft.openapiSource,
          openapiFilename: draft.openapiSourceName,
          gatewaySource,
        });
        if (!result.compiled) throw new Error('Gateway configuration did not compile.');
        setValidation(result);
        setValidatedGatewaySource(gatewaySource);
        advance(3);
      } catch (cause) {
        handleFailure(cause);
      } finally {
        setBusy(false);
      }
    }
  }

  async function finishCreation() {
    const gatewaySource = serializeGatewayConfiguration(draft);
    if (!validation?.compiled || gatewaySource !== validatedGatewaySource) {
      setError('The configuration changed after validation. Return to Routing & policies and validate it again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await createConfiguredProxy({
        organizationId: draft.organizationId,
        name: draft.name,
        openapiSource: draft.openapiSource,
        openapiFilename: draft.openapiSourceName,
        gatewaySource,
      });
      setDirty(false);
      router.push(`/proxies/${result.proxy.id}?created=1`);
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  const selectedOrganization = useMemo(
    () => organizations.find(organization => organization.id === draft.organizationId),
    [draft.organizationId, organizations],
  );

  if (isLoading) {
    return <div className="proxy-creation-loading" aria-label="Loading proxy creation"><div /><div /></div>;
  }

  if (organizations.length === 0) {
    return (
      <div className="proxy-creation-empty">
        <ProxyIcon />
        <h1>Proxy creation is unavailable</h1>
        <p>{error || 'Your account does not administer an organization. Ask a platform administrator to grant organization administration access.'}</p>
        <button className="secondary-command" type="button" onClick={() => router.push('/proxies')}>Return to proxies</button>
      </div>
    );
  }

  return (
    <div className="proxy-creation-page">
      <header className="proxy-creation-header">
        <div><h1>Create proxy</h1><p>Define the complete immutable route before a control-plane identity is written.</p></div>
        <button className="creation-cancel-command" type="button" onClick={cancel}><CloseIcon />Cancel</button>
      </header>

      <div className="proxy-creation-shell">
        <CreationStepNav currentStep={step} highestStep={highestStep} onSelect={goToStep} />
        <form
          className="creation-workspace"
          onSubmit={e => {
            e.preventDefault();
            if (step < 3) void continueFlow();
            else void finishCreation();
          }}
        >
          <p className="sr-only" aria-live="polite">
            {isBusy ? (step === 3 ? 'Creating proxy.' : 'Validating configuration.') : error}
          </p>
          {step === 0 && (
            <IdentityStep
              organizations={organizations}
              organizationId={draft.organizationId}
              name={draft.name}
              error={error}
              onOrganizationChange={organizationId => updateDraft(current => ({ ...current, organizationId }))}
              onNameChange={name => updateDraft(current => ({ ...current, name }))}
            />
          )}
          {step === 1 && (
            <DefinitionStep
              openapiSource={draft.openapiSource}
              openapiSourceName={draft.openapiSourceName}
              gatewayImportName={gatewayImportName}
              error={error}
              onOpenApiChange={(openapiSource, openapiSourceName) => updateDraft(current => ({
                ...current,
                openapiSource,
                openapiSourceName,
                openapiVersion: '',
                openapiTitle: null,
                operations: [],
              }))}
              onGatewayImport={(source, filename) => {
                setPendingGatewayImport({ source, filename });
                setGatewayImportName(filename);
                setDirty(true);
                setHighestStep(current => Math.min(current, 1));
                setValidation(null);
                setValidatedGatewaySource('');
                setError('');
              }}
            />
          )}
          {step === 2 && (
            <RoutingStep
              draft={draft}
              error={error}
              onBasePathChange={basePath => updateDraft(current => ({ ...current, basePath }))}
              onDefaultPoliciesChange={(defaultPolicies: EditablePolicy[]) => updateDraft(current => ({ ...current, defaultPolicies }))}
              onOperationChange={(operation: OpenApiOperationDraft) => updateDraft(current => ({
                ...current,
                operations: current.operations.map(candidate => candidate.operationId === operation.operationId ? operation : candidate),
              }))}
            />
          )}
          {step === 3 && validation && (
            <ReviewStep
              draft={draft}
              organization={selectedOrganization}
              validation={validation}
              gatewaySource={validatedGatewaySource}
              error={error}
            />
          )}

          <footer className="creation-footer">
            <span>{step === 3 ? 'Creation does not deploy or change runtime traffic.' : 'Nothing is saved until the final step.'}</span>
            <div>
              {step > 0 && <button className="secondary-command" type="button" disabled={isBusy} onClick={() => goToStep(step - 1)}>Back</button>}
              {step < 3 ? (
                <button className="primary-command" type="submit" disabled={isBusy}>{isBusy ? 'Validating…' : <>Continue<ArrowIcon /></>}</button>
              ) : (
                <button className="primary-command" type="submit" disabled={isBusy}>{isBusy ? 'Creating…' : 'Create proxy and revision'}</button>
              )}
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
