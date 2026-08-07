import type { Organization } from '@/lib/api-client';

interface IdentityStepProps {
  organizations: Organization[];
  organizationId: string;
  name: string;
  error: string;
  onOrganizationChange: (organizationId: string) => void;
  onNameChange: (name: string) => void;
}

export function IdentityStep({
  organizations,
  organizationId,
  name,
  error,
  onOrganizationChange,
  onNameChange,
}: IdentityStepProps) {
  return (
    <section className="creation-step" aria-labelledby="identity-step-title">
      <header className="creation-step-heading">
        <h2 id="identity-step-title">Name the control-plane route</h2>
        <p>The organization owns the proxy, every immutable revision, and its future product exposure.</p>
      </header>
      <div className="creation-field-grid">
        <label className="field">
          <span>Organization</span>
          <select
            value={organizationId}
            required
            aria-invalid={Boolean(error && !organizationId)}
            onChange={event => onOrganizationChange(event.target.value)}
          >
            <option value="" disabled>Select an organization</option>
            {organizations.map(organization => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
          <small>Only organizations you can administer are listed.</small>
        </label>
        <label className="field">
          <span>Proxy name</span>
          <input
            value={name}
            required
            maxLength={120}
            autoFocus
            placeholder="Accounts API"
            aria-invalid={Boolean(error && (!name.trim() || name.trim().length > 120))}
            onChange={event => onNameChange(event.target.value)}
          />
          <small>{name.length}/120 characters · used as the operational label.</small>
        </label>
      </div>
      {error && <p className="creation-inline-error" role="alert" tabIndex={-1}>{error}</p>}
    </section>
  );
}
