'use client';

import {
  CheckCircle2,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldX,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { OrganizationSelect } from '@/components/organization-select';
import { StatusPill } from '@/components/status-pill';
import { managementFetch, type Organization } from '@/lib/api-client';

interface Authority {
  id: string;
  name: string;
  kind: 'managed' | 'external';
  status: string;
  isDefaultIssuer: boolean;
  fingerprintSha256: string;
  subject: string;
  expiresAt: string;
  crlNextUpdate: string | null;
  crlDistributionUrl: string | null;
}

type Dialog = 'managed' | 'external' | 'crl' | null;

export default function AuthoritiesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedId, setSelectedId] = useState('');
  const [isPlatformAdmin, setPlatformAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async (selectedOrganization = organizationId) => {
    if (!selectedOrganization) return;
    setAuthorities(await managementFetch<Authority[]>(
      `organizations/${selectedOrganization}/certificate-authorities`,
    ));
  };
  useEffect(() => {
    Promise.all([
      managementFetch<Organization[]>('organizations'),
      fetch('/api/auth/session').then(response => response.json()),
    ]).then(([items, session]) => {
      setOrganizations(items);
      setOrganizationId(items[0]?.id ?? '');
      setPlatformAdmin(session.principal.memberships.some(
        (membership: { role: string }) => membership.role === 'platformAdmin',
      ));
    }).catch(cause => setError(cause.message));
  }, []);
  useEffect(() => {
    refresh().catch(cause => setError(cause.message));
  }, [organizationId]);

  async function mutate(path: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await managementFetch(path, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setDialog(null);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (dialog === 'managed') {
      await mutate(
        `organizations/${organizationId}/certificate-authorities/managed`,
        { name: data.get('name'), validityDays: Number(data.get('validityDays')) },
      );
    } else if (dialog === 'external') {
      await mutate(
        `organizations/${organizationId}/certificate-authorities/external`,
        {
          name: data.get('name'),
          certificatePem: data.get('certificatePem'),
          chainPem: data.get('chainPem') || null,
          crlDistributionUrl: data.get('crlDistributionUrl') || null,
        },
      );
    } else {
      await mutate(`certificate-authorities/${selectedId}/crl`, {
        crlPem: data.get('crlPem'),
      });
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Certificate authorities</h1>
          <p>Organization trust anchors, rotation and revocation state.</p>
        </div>
        <div className="header-actions">
          <OrganizationSelect organizations={organizations} value={organizationId} onChange={setOrganizationId} />
          {isPlatformAdmin && (
            <>
              <button className="secondary-command" onClick={() => setDialog('external')}><Upload size={17} />Import</button>
              <button className="primary-command" onClick={() => setDialog('managed')}><Plus size={17} />Create</button>
            </>
          )}
        </div>
      </header>
      {error && <div className="alert error">{error}</div>}
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Validity</th><th>CRL</th><th>Status</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {authorities.map(authority => (
              <tr key={authority.id}>
                <td>
                  <strong>{authority.name}</strong>
                  <code title={authority.fingerprintSha256}>{authority.fingerprintSha256.slice(0, 18)}...</code>
                </td>
                <td>{authority.kind}{authority.isDefaultIssuer ? ' / issuer' : ''}</td>
                <td>{new Date(authority.expiresAt).toLocaleDateString()}</td>
                <td>{authority.crlNextUpdate ? new Date(authority.crlNextUpdate).toLocaleString() : 'Not loaded'}</td>
                <td><StatusPill value={authority.status} /></td>
                <td className="row-actions">
                  {isPlatformAdmin && authority.status === 'draft' && (
                    <button title="Activate" onClick={() => mutate(`certificate-authorities/${authority.id}/active`)}><CheckCircle2 size={16} /></button>
                  )}
                  {isPlatformAdmin && authority.status === 'active' && authority.kind === 'managed' && (
                    <button title="Rotate" onClick={() => mutate(`certificate-authorities/${authority.id}/rotate`)}><RotateCw size={16} /></button>
                  )}
                  {isPlatformAdmin && authority.status === 'active' && (
                    <button title="Mark retiring" onClick={() => mutate(`certificate-authorities/${authority.id}/retiring`)}><KeyRound size={16} /></button>
                  )}
                  {isPlatformAdmin && authority.kind === 'external' && (
                    <button title="Upload CRL" onClick={() => { setSelectedId(authority.id); setDialog('crl'); }}><Upload size={16} /></button>
                  )}
                  {isPlatformAdmin && (
                    <button title="Refresh CRL" onClick={() => mutate(`certificate-authorities/${authority.id}/refresh-crl`)}><RefreshCw size={16} /></button>
                  )}
                  {isPlatformAdmin && authority.status !== 'revoked' && (
                    <button title="Revoke authority" onClick={() => mutate(`certificate-authorities/${authority.id}/revoked`)}><ShieldX size={16} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {authorities.length === 0 && <div className="empty-state">No authorities found.</div>}
      </section>
      {dialog && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={submit}>
            <header>
              <div><KeyRound size={20} /><h2>{dialog === 'managed' ? 'Create managed authority' : dialog === 'external' ? 'Import external authority' : 'Upload CRL'}</h2></div>
              <button type="button" onClick={() => setDialog(null)} title="Close"><X size={18} /></button>
            </header>
            {dialog !== 'crl' && (
              <label className="field"><span>Name</span><input name="name" required maxLength={120} /></label>
            )}
            {dialog === 'managed' && (
              <label className="field"><span>Validity days</span><input name="validityDays" type="number" min="365" max="3650" defaultValue="3650" required /></label>
            )}
            {dialog === 'external' && (
              <>
                <label className="field"><span>CA certificate (PEM)</span><textarea name="certificatePem" rows={8} required /></label>
                <label className="field"><span>Intermediate chain (PEM)</span><textarea name="chainPem" rows={5} /></label>
                <label className="field"><span>CRL distribution URL</span><input name="crlDistributionUrl" type="url" placeholder="https://..." /></label>
              </>
            )}
            {dialog === 'crl' && (
              <label className="field"><span>CRL (PEM)</span><textarea name="crlPem" rows={10} required /></label>
            )}
            <footer>
              <button type="button" className="secondary-command" onClick={() => setDialog(null)}>Cancel</button>
              <button className="primary-command" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
