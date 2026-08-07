import { useDeferredValue, useMemo, useState } from 'react';
import { SearchIcon } from '@/components/gateway-icons';
import { PolicyEditor } from '@/components/proxy-creation/policy-editor';
import {
  validatePolicies,
  validateTargetPath,
  type EditablePolicy,
  type OpenApiOperationDraft,
  type ProxyCreationDraft,
} from '@/lib/proxy-creation';

interface RoutingStepProps {
  draft: ProxyCreationDraft;
  error: string;
  onBasePathChange: (basePath: string) => void;
  onDefaultPoliciesChange: (policies: EditablePolicy[]) => void;
  onOperationChange: (operation: OpenApiOperationDraft) => void;
}

export function RoutingStep({
  draft,
  error,
  onBasePathChange,
  onDefaultPoliciesChange,
  onOperationChange,
}: RoutingStepProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(draft.operations[0]?.operationId ?? '');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filteredOperations = useMemo(() => draft.operations.filter(operation =>
    !deferredQuery
    || operation.operationId.toLowerCase().includes(deferredQuery)
    || operation.method.toLowerCase().includes(deferredQuery)
    || operation.path.toLowerCase().includes(deferredQuery)), [deferredQuery, draft.operations]);
  const selected = draft.operations.find(operation => operation.operationId === selectedId)
    ?? filteredOperations[0]
    ?? draft.operations[0];
  const targetValidation = selected
    ? validateTargetPath(selected.path, selected.targetPath)
    : { valid: true, errors: [] };
  const policyValidation = selected && !selected.inheritPolicies
    ? validatePolicies(selected.policies)
    : { valid: true, errors: [] };

  return (
    <section className="creation-step routing-creation-step" aria-labelledby="routing-step-title">
      <header className="creation-step-heading routing-step-heading">
        <div><h2 id="routing-step-title">Build the request path</h2><p>Set the public base path once, then refine upstream targets and policies only where an operation differs.</p></div>
        <label className="field base-path-field"><span>Public base path</span><input value={draft.basePath} placeholder="/banking/v1" onChange={event => onBasePathChange(event.target.value)} /></label>
      </header>

      <PolicyEditor label="Default pipeline" policies={draft.defaultPolicies} onChange={onDefaultPoliciesChange} />

      <div className="operation-editor" aria-label="Operation routing configuration">
        <div className="operation-editor-index">
          <label className="operation-search"><SearchIcon /><span className="sr-only">Search operations</span><input value={query} placeholder="Search operations" onChange={event => setQuery(event.target.value)} /></label>
          <div className="operation-select-list">
            {filteredOperations.map(operation => (
              <button
                type="button"
                key={operation.operationId}
                aria-pressed={selected?.operationId === operation.operationId}
                onClick={() => setSelectedId(operation.operationId)}
              >
                <span className={`method method-${operation.method.toLowerCase()}`}>{operation.method}</span>
                <span><strong>{operation.operationId}</strong><code>{operation.path}</code></span>
              </button>
            ))}
            {filteredOperations.length === 0 && <p>No operations match “{query}”.</p>}
          </div>
        </div>

        {selected && (
          <div className="operation-editor-detail">
            <header><div><h3>{selected.operationId}</h3><p><span className={`method method-${selected.method.toLowerCase()}`}>{selected.method}</span><code>{selected.path}</code></p></div></header>
            <label className="field"><span>Upstream target path</span><input value={selected.targetPath} aria-invalid={!targetValidation.valid} onChange={event => onOperationChange({ ...selected, targetPath: event.target.value })} /><small>Public path parameters may be reused; new parameters are rejected.</small></label>
            {!targetValidation.valid && <p className="creation-inline-error" role="alert" tabIndex={-1}>{targetValidation.errors.join(' ')}</p>}
            <label className="toggle-field operation-inherit-toggle">
              <input type="checkbox" checked={selected.inheritPolicies} onChange={event => onOperationChange({ ...selected, inheritPolicies: event.target.checked })} />
              <span><strong>Inherit the default pipeline</strong><small>Turn this off to replace defaults for this operation.</small></span>
            </label>
            {!selected.inheritPolicies && (
              <PolicyEditor label="Operation pipeline" policies={selected.policies} onChange={policies => onOperationChange({ ...selected, policies })} />
            )}
            {!policyValidation.valid && <p className="creation-inline-error" role="alert" tabIndex={-1}>{policyValidation.errors.join(' ')}</p>}
          </div>
        )}
        {draft.operations.length === 0 && (
          <div className="operation-editor-empty">
            <strong>No supported operations found</strong>
            <p>Return to API definition and provide an OpenAPI document with supported HTTP operations.</p>
          </div>
        )}
      </div>
      {error && <p className="creation-inline-error creation-step-error" role="alert" tabIndex={-1}>{error}</p>}
    </section>
  );
}
