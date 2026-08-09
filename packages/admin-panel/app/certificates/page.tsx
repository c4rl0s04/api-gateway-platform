'use client';

import {
  Download,
  RefreshCw,
  ShieldX,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CertificateRegistrationDialog } from '@/components/certificate-registration-dialog';
import { OrganizationSelect } from '@/components/organization-select';
import { StatusPill } from '@/components/status-pill';
import {
  managementFetch,
  type CertificateAuthority,
  type CertificateRecord,
  type DeveloperApp,
  type Organization,
} from '@/lib/api-client';

export default function CertificatesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [authorities, setAuthorities] = useState<CertificateAuthority[]>([]);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const credentials = useMemo(
    () => apps.flatMap(app => app.credentials
      .map(credential => ({ ...credential, appName: app.name }))),
    [apps],
  );

  const refresh = async (selectedOrganization = organizationId) => {
    if (!selectedOrganization) return;
    const [nextApps, nextCertificates, nextAuthorities] = await Promise.all([
      managementFetch<DeveloperApp[]>(`organizations/${selectedOrganization}/apps`),
      managementFetch<CertificateRecord[]>(`organizations/${selectedOrganization}/certificates`),
      managementFetch<CertificateAuthority[]>(`organizations/${selectedOrganization}/certificate-authorities`),
    ]);
    setApps(nextApps);
    setCertificates(nextCertificates);
    setAuthorities(nextAuthorities);
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
          <button className="primary-command" onClick={() => setRegistering(true)}>
            <Upload size={17} />Register
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
                  <Link href={`/apps/${certificate.credential.app.id}`}><strong>{certificate.credential.app.name}</strong></Link>
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

      {registering && (
        <CertificateRegistrationDialog
          credentials={credentials}
          authorities={authorities}
          onClose={() => setRegistering(false)}
          onRegistered={refresh}
        />
      )}
    </>
  );
}
