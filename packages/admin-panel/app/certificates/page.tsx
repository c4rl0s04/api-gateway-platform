'use client';

import {
  Download,
  FileKey,
  Plus,
  RefreshCw,
  ShieldX,
  Upload,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { OrganizationSelect } from '@/components/organization-select';
import { StatusPill } from '@/components/status-pill';
import {
  managementFetch,
  type CertificateRecord,
  type DeveloperApp,
  type Organization,
} from '@/lib/api-client';

type FormMode = 'issue' | 'external' | null;

export default function CertificatesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [mode, setMode] = useState<FormMode>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const credentials = useMemo(
    () => apps.flatMap(app => app.credentials
      .map(credential => ({ ...credential, appName: app.name }))),
    [apps],
  );

  const refresh = async (selectedOrganization = organizationId) => {
    if (!selectedOrganization) return;
    const [nextApps, nextCertificates] = await Promise.all([
      managementFetch<DeveloperApp[]>(`organizations/${selectedOrganization}/apps`),
      managementFetch<CertificateRecord[]>(`organizations/${selectedOrganization}/certificates`),
    ]);
    setApps(nextApps);
    setCertificates(nextCertificates);
  };
  useEffect(() => {
    managementFetch<Organization[]>('organizations')
      .then(items => {
        setOrganizations(items);
        setOrganizationId(items[0]?.id ?? '');
      })
      .catch(cause => setError(cause.message));
  }, []);
  useEffect(() => {
    refresh().catch(cause => setError(cause.message));
  }, [organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const credentialId = String(data.get('credentialId'));
    setBusy(true);
    setError('');
    try {
      if (mode === 'issue') {
        await managementFetch(`credentials/${credentialId}/certificates/issue`, {
          method: 'POST',
          body: JSON.stringify({
            csrPem: data.get('csrPem'),
            validityDays: Number(data.get('validityDays')),
          }),
        });
      } else {
        await managementFetch(`credentials/${credentialId}/certificates/external`, {
          method: 'POST',
          body: JSON.stringify({
            authorityId: data.get('authorityId'),
            certificatePem: data.get('certificatePem'),
            chainPem: data.get('chainPem') || null,
          }),
        });
      }
      setMode(null);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revoke this certificate?')) return;
    setBusy(true);
    try {
      await managementFetch(`certificates/${id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'unspecified' }),
      });
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    const material = await managementFetch<{
      certificatePem: string;
      chainPem: string | null;
    }>(`certificates/${id}/download`);
    const blob = new Blob(
      [`${material.certificatePem}${material.chainPem ?? ''}`],
      { type: 'application/x-pem-file' },
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${id}.pem`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Client certificates</h1>
          <p>Issued and externally registered mTLS identities.</p>
        </div>
        <div className="header-actions">
          <OrganizationSelect
            organizations={organizations}
            value={organizationId}
            onChange={setOrganizationId}
          />
          <button className="icon-command" onClick={() => refresh()} title="Refresh">
            <RefreshCw size={17} />
          </button>
          <button className="secondary-command" onClick={() => setMode('external')}>
            <Upload size={17} />Register
          </button>
          <button className="primary-command" onClick={() => setMode('issue')}>
            <Plus size={17} />Issue
          </button>
        </div>
      </header>
      {error && <div className="alert error">{error}</div>}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Application</th>
              <th>Subject</th>
              <th>Authority</th>
              <th>Validity</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {certificates.map(certificate => (
              <tr key={certificate.id}>
                <td>
                  <strong>{certificate.credential.app.name}</strong>
                  <code>{certificate.credential.consumerKey}</code>
                </td>
                <td>
                  <span>{certificate.subject ?? 'Unavailable'}</span>
                  <code title={certificate.fingerprintSha256}>
                    {certificate.fingerprintSha256.slice(0, 16)}...
                  </code>
                </td>
                <td>{certificate.authority?.name ?? 'Legacy'}</td>
                <td>
                  {new Date(certificate.validFrom).toLocaleDateString()}
                  {' - '}
                  {certificate.expiresAt
                    ? new Date(certificate.expiresAt).toLocaleDateString()
                    : 'No expiry'}
                </td>
                <td><StatusPill value={certificate.status} /></td>
                <td className="row-actions">
                  <button title="Download certificate" onClick={() => download(certificate.id)}>
                    <Download size={16} />
                  </button>
                  {certificate.status !== 'revoked' && (
                    <button title="Revoke certificate" onClick={() => revoke(certificate.id)}>
                      <ShieldX size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {certificates.length === 0 && (
          <div className="empty-state">No certificates found.</div>
        )}
      </section>

      {mode && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={submit}>
            <header>
              <div>
                {mode === 'issue' ? <FileKey size={20} /> : <Upload size={20} />}
                <h2>{mode === 'issue' ? 'Issue certificate' : 'Register certificate'}</h2>
              </div>
              <button type="button" onClick={() => setMode(null)} title="Close">
                <X size={18} />
              </button>
            </header>
            <label className="field">
              <span>mTLS credential</span>
              <select name="credentialId" required>
                {credentials.map(credential => (
                  <option key={credential.id} value={credential.id}>
                    {credential.appName} - {credential.consumerKey}
                  </option>
                ))}
              </select>
            </label>
            {mode === 'issue' ? (
              <>
                <label className="field">
                  <span>CSR (PEM)</span>
                  <textarea name="csrPem" rows={9} required />
                </label>
                <label className="field">
                  <span>Validity days</span>
                  <input name="validityDays" type="number" min="1" max="365" defaultValue="90" required />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Authority ID</span>
                  <input name="authorityId" required />
                </label>
                <label className="field">
                  <span>Certificate (PEM)</span>
                  <textarea name="certificatePem" rows={7} required />
                </label>
                <label className="field">
                  <span>Intermediate chain (PEM)</span>
                  <textarea name="chainPem" rows={5} />
                </label>
              </>
            )}
            <footer>
              <button type="button" className="secondary-command" onClick={() => setMode(null)}>
                Cancel
              </button>
              <button className="primary-command" disabled={busy || credentials.length === 0}>
                {busy ? 'Saving...' : 'Save'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
