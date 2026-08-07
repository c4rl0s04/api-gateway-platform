import type { Organization } from '@/lib/api-client';
import type {
  BusinessPolicyType,
  ProxyConfigurationValidation,
  ProxyCreationDraft,
} from '@/lib/proxy-creation';

const policyLabels: Record<BusinessPolicyType, string> = {
  'api-key-auth': 'API key authentication',
  'oauth-access-token': 'OAuth access token validation',
  'mtls-auth': 'Mutual TLS authentication',
  'rate-limit': 'Rate limiting',
};

interface ReviewStepProps {
  draft: ProxyCreationDraft;
  organization: Organization | undefined;
  validation: ProxyConfigurationValidation;
  gatewaySource: string;
  error: string;
}

export function ReviewStep({
  draft,
  organization,
  validation,
  gatewaySource,
  error,
}: ReviewStepProps) {
  const overrides = draft.operations.filter(operation => !operation.inheritPolicies).length;
  const operationChanges = draft.operations.filter(operation =>
    !operation.inheritPolicies || operation.targetPath !== operation.path);
  return (
    <section className="creation-step" aria-labelledby="review-step-title">
      <header className="creation-step-heading">
        <h2 id="review-step-title">Commit revision 1</h2>
        <p>The proxy identity and this validated configuration are written together. Runtime traffic remains unchanged.</p>
      </header>

      <dl className="creation-review-facts">
        <div><dt>Proxy</dt><dd>{draft.name}</dd></div>
        <div><dt>Organization</dt><dd>{organization?.name ?? draft.organizationId}</dd></div>
        <div><dt>Base path</dt><dd><code>{draft.basePath}</code></dd></div>
        <div><dt>OpenAPI</dt><dd>{draft.openapiVersion} · {draft.operations.length} operations</dd></div>
        <div><dt>Default policies</dt><dd>{draft.defaultPolicies.length}</dd></div>
        <div><dt>Operation overrides</dt><dd>{overrides}</dd></div>
        <div><dt>Content hash</dt><dd><code>{validation.compiled?.contentHash}</code></dd></div>
        <div><dt>Deployment</dt><dd>None · configure after creation</dd></div>
      </dl>

      <div className="review-configuration-summary">
        <section aria-labelledby="default-pipeline-review-title">
          <h3 id="default-pipeline-review-title">Default pipeline</h3>
          {draft.defaultPolicies.length > 0 ? (
            <ol>
              {draft.defaultPolicies.map((policy, index) => (
                <li key={policy.id}>
                  <span>{index + 1}</span>
                  <strong>{policyLabels[policy.type]}</strong>
                  <small>{policy.enabled ? 'Enabled' : 'Disabled'} · fail {policy.failureMode}</small>
                </li>
              ))}
            </ol>
          ) : <p>No default policies. Requests pass directly to the configured upstream.</p>}
        </section>
        <section aria-labelledby="operation-overrides-review-title">
          <h3 id="operation-overrides-review-title">Operation changes</h3>
          {operationChanges.length > 0 ? (
            <ul>
              {operationChanges.map(operation => (
                <li key={operation.operationId}>
                  <strong>{operation.operationId}</strong>
                  <code>{operation.targetPath}</code>
                  <small>{operation.inheritPolicies ? 'Default pipeline' : `${operation.policies.length} policy override${operation.policies.length === 1 ? '' : 's'}`}</small>
                </li>
              ))}
            </ul>
          ) : <p>All operations preserve their OpenAPI path and inherit the default pipeline.</p>}
        </section>
      </div>

      {(validation.compiled?.warnings.length ?? 0) > 0 && (
        <div className="creation-warning" role="status">
          <strong>Validation notes</strong>
          <ul>{validation.compiled?.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      <details className="gateway-source-review">
        <summary>Review normalized Gateway YAML</summary>
        <pre>{gatewaySource}</pre>
      </details>

      {error && <p className="creation-inline-error" role="alert" tabIndex={-1}>{error}</p>}
    </section>
  );
}
