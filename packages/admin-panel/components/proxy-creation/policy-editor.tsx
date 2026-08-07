import { useState } from 'react';
import { ChevronIcon, CloseIcon, PlusIcon, LockIcon, TokenIcon, CertificateIcon } from '@/components/gateway-icons';
import {
  BUSINESS_POLICY_TYPES,
  AUTHENTICATION_POLICIES,
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

const authPolicyIcons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'api-key-auth': LockIcon,
  'oauth-access-token': TokenIcon,
  'mtls-auth': CertificateIcon,
};

const authPolicyDescriptions: Record<string, string> = {
  'api-key-auth': 'Simple, static header key',
  'oauth-access-token': 'Granular JWT scopes & audience',
  'mtls-auth': 'Client certificate validation',
};

function replacePolicy(
  policies: EditablePolicy[],
  id: string,
  update: Partial<EditablePolicy>,
) {
  return policies.map(policy => policy.id === id ? { ...policy, ...update } : policy);
}

export function PolicyEditor({ label, policies, onChange }: PolicyEditorProps) {
  const [nextType, setNextType] = useState<BusinessPolicyType>('rate-limit');

  const authPolicy = policies.find(p => AUTHENTICATION_POLICIES.has(p.type));
  const otherPolicies = policies.filter(p => !AUTHENTICATION_POLICIES.has(p.type));

  function changeAuthType(type: BusinessPolicyType) {
    if (authPolicy?.type === type) return;
    const newAuthPolicy = createEditablePolicy(type, crypto.randomUUID());
    onChange([newAuthPolicy, ...otherPolicies]);
  }

  function addOtherPolicy() {
    onChange([...policies, createEditablePolicy(nextType, crypto.randomUUID())]);
  }

  function moveOtherPolicy(otherIndex: number, direction: -1 | 1) {
    const target = otherIndex + direction;
    if (target < 0 || target >= otherPolicies.length) return;
    const nextOther = [...otherPolicies];
    [nextOther[otherIndex], nextOther[target]] = [nextOther[target], nextOther[otherIndex]];
    onChange(authPolicy ? [authPolicy, ...nextOther] : nextOther);
  }

  function removeOtherPolicy(id: string) {
    onChange(policies.filter(p => p.id !== id));
  }

  function renderPolicyConfig(policy: EditablePolicy) {
    return (
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
    );
  }

  return (
    <div className="policy-editor">
      <header>
        <div><h4>{label}</h4><span>{policies.length} configured</span></div>
      </header>

      <section className="policy-section">
        <h5>Authentication (Required)</h5>
        <div className="auth-policy-cards">
          {Array.from(AUTHENTICATION_POLICIES).map(type => {
            const Icon = authPolicyIcons[type] ?? LockIcon;
            const isSelected = authPolicy?.type === type;
            return (
              <button
                key={type}
                type="button"
                className={`auth-card ${isSelected ? 'is-selected' : ''}`}
                onClick={() => changeAuthType(type)}
                aria-pressed={isSelected}
              >
                <div className="auth-card-icon"><Icon /></div>
                <div className="auth-card-content">
                  <strong>{policyLabels[type]}</strong>
                  <small>{authPolicyDescriptions[type]}</small>
                </div>
              </button>
            );
          })}
        </div>
        
        {authPolicy && (
          <div className="auth-policy-config">
            <div className="policy-fields">
              {renderPolicyConfig(authPolicy)}
            </div>
          </div>
        )}
      </section>

      <section className="policy-section">
        <h5>Traffic &amp; Security (Optional)</h5>
        <div className="policy-add-controls">
          <label className="sr-only" htmlFor={`${label}-other-type`}>Policy type</label>
          <select
            id={`${label}-other-type`}
            value={nextType}
            onChange={event => setNextType(event.target.value as BusinessPolicyType)}
          >
            {BUSINESS_POLICY_TYPES.filter(t => !AUTHENTICATION_POLICIES.has(t)).map(type => (
              <option key={type} value={type}>{policyLabels[type]}</option>
            ))}
          </select>
          <button type="button" className="secondary-command" onClick={addOtherPolicy}><PlusIcon />Add policy</button>
        </div>

        {otherPolicies.length === 0 ? (
          <p className="policy-empty-state">No optional policies configured.</p>
        ) : (
          <ol className="editable-policy-list">
            {otherPolicies.map((policy, index) => (
              <li key={policy.id} className={policy.enabled ? '' : 'is-disabled'}>
                <div className="policy-order">{index + (authPolicy ? 2 : 1)}</div>
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
                  {renderPolicyConfig(policy)}
                </div>
                <div className="policy-row-actions">
                  <button type="button" disabled={index === 0} aria-label={`Move ${policyLabels[policy.type]} earlier`} onClick={() => moveOtherPolicy(index, -1)}><ChevronIcon className="move-up" /></button>
                  <button type="button" disabled={index === otherPolicies.length - 1} aria-label={`Move ${policyLabels[policy.type]} later`} onClick={() => moveOtherPolicy(index, 1)}><ChevronIcon className="move-down" /></button>
                  <button type="button" aria-label={`Remove ${policyLabels[policy.type]}`} onClick={() => removeOtherPolicy(policy.id)}><CloseIcon /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
