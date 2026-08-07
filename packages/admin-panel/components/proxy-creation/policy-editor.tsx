import { useState } from 'react';
import { ChevronIcon, CloseIcon, PlusIcon } from '@/components/gateway-icons';
import {
  BUSINESS_POLICY_TYPES,
  createEditablePolicy,
  type BusinessPolicyType,
  type EditablePolicy,
} from '@/lib/proxy-creation';

interface PolicyEditorProps {
  label: string;
  policies: EditablePolicy[];
  onChange: (policies: EditablePolicy[]) => void;
}

const policyLabels: Record<BusinessPolicyType, string> = {
  'api-key-auth': 'API key authentication',
  'oauth-access-token': 'OAuth access token',
  'mtls-auth': 'Mutual TLS authentication',
  'rate-limit': 'Rate limit',
};

function replacePolicy(
  policies: EditablePolicy[],
  id: string,
  update: Partial<EditablePolicy>,
) {
  return policies.map(policy => policy.id === id ? { ...policy, ...update } : policy);
}

export function PolicyEditor({ label, policies, onChange }: PolicyEditorProps) {
  const [nextType, setNextType] = useState<BusinessPolicyType>('api-key-auth');

  function addPolicy() {
    onChange([...policies, createEditablePolicy(nextType, crypto.randomUUID())]);
  }

  function movePolicy(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= policies.length) return;
    const next = [...policies];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="policy-editor">
      <header>
        <div><h4>{label}</h4><span>{policies.length} configured</span></div>
        <div className="policy-add-controls">
          <label className="sr-only" htmlFor={`${label}-policy-type`}>Policy type</label>
          <select
            id={`${label}-policy-type`}
            value={nextType}
            onChange={event => setNextType(event.target.value as BusinessPolicyType)}
          >
            {BUSINESS_POLICY_TYPES.map(type => (
              <option key={type} value={type}>{policyLabels[type]}</option>
            ))}
          </select>
          <button type="button" className="secondary-command" onClick={addPolicy}><PlusIcon />Add policy</button>
        </div>
      </header>

      {policies.length === 0 ? (
        <p className="policy-empty-state">No policies configured. Requests pass to the upstream without gateway authentication or rate limiting.</p>
      ) : (
        <ol className="editable-policy-list">
          {policies.map((policy, index) => (
            <li key={policy.id} className={policy.enabled ? '' : 'is-disabled'}>
              <div className="policy-order">{index + 1}</div>
              <div className="policy-fields">
                <div className="policy-title-row">
                  <strong>{policyLabels[policy.type]}</strong>
                  <label className="compact-toggle">
                    <input
                      type="checkbox"
                      checked={policy.enabled}
                      onChange={event => onChange(replacePolicy(policies, policy.id, { enabled: event.target.checked }))}
                    />
                    Enabled
                  </label>
                </div>
                <div className="policy-config-grid">
                  <label className="field">
                    <span>Failure mode</span>
                    <select
                      value={policy.failureMode}
                      onChange={event => onChange(replacePolicy(policies, policy.id, {
                        failureMode: event.target.value as 'open' | 'closed',
                      }))}
                    >
                      <option value="closed">Closed</option>
                      <option value="open">Open</option>
                    </select>
                  </label>
                  {policy.type === 'api-key-auth' && (
                    <label className="field"><span>Header</span><input value={policy.header ?? ''} onChange={event => onChange(replacePolicy(policies, policy.id, { header: event.target.value }))} /></label>
                  )}
                  {policy.type === 'oauth-access-token' && (
                    <>
                      <label className="field"><span>Audience</span><input value={policy.audience ?? ''} placeholder="api-gateway" onChange={event => onChange(replacePolicy(policies, policy.id, { audience: event.target.value }))} /></label>
                      <label className="field policy-scopes-field"><span>Required scopes</span><input value={(policy.requiredScopes ?? []).join(', ')} placeholder="banking:read, banking:write" onChange={event => onChange(replacePolicy(policies, policy.id, { requiredScopes: event.target.value.split(/[\s,]+/).filter(Boolean) }))} /></label>
                    </>
                  )}
                  {policy.type === 'rate-limit' && (
                    <>
                      <label className="field"><span>Request limit</span><input type="number" min="1" step="1" value={policy.limit ?? 100} onChange={event => onChange(replacePolicy(policies, policy.id, { limit: Number(event.target.value) }))} /></label>
                      <label className="field"><span>Window seconds</span><input type="number" min="1" step="1" value={policy.windowSeconds ?? 60} onChange={event => onChange(replacePolicy(policies, policy.id, { windowSeconds: Number(event.target.value) }))} /></label>
                    </>
                  )}
                </div>
              </div>
              <div className="policy-row-actions">
                <button type="button" disabled={index === 0} aria-label={`Move ${policyLabels[policy.type]} earlier`} onClick={() => movePolicy(index, -1)}><ChevronIcon className="move-up" /></button>
                <button type="button" disabled={index === policies.length - 1} aria-label={`Move ${policyLabels[policy.type]} later`} onClick={() => movePolicy(index, 1)}><ChevronIcon className="move-down" /></button>
                <button type="button" aria-label={`Remove ${policyLabels[policy.type]}`} onClick={() => onChange(policies.filter(candidate => candidate.id !== policy.id))}><CloseIcon /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
