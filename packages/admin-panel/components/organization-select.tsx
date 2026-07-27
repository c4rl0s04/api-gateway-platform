import type { Organization } from '@/lib/api-client';

export function OrganizationSelect({
  organizations,
  value,
  onChange,
}: {
  organizations: Organization[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field compact-field">
      <span>Organization</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {organizations.map(organization => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </label>
  );
}
