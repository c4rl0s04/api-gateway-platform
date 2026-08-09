'use client';

import { ArrowLeft, Download, KeyRound, ShieldX, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CertificateRegistrationDialog,
  type CertificateCredentialOption,
} from '@/components/certificate-registration-dialog';
import { StatusPill } from '@/components/status-pill';
import {
  managementFetch,
  type CertificateAuthority,
  type CertificateRecord,
  type DeveloperApp,
} from '@/lib/api-client';

export default function ApplicationDetailPage({ params }: { params: { appId: string } }) {
  const [app, setApp] = useState<DeveloperApp | null>(null);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [authorities, setAuthorities] = useState<CertificateAuthority[]>([]);
  const [registrationCredentialId, setRegistrationCredentialId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const nextApp = await managementFetch<DeveloperApp>(`apps/${params.appId}`);
    const [nextAuthorities, certificateGroups] = await Promise.all([
      managementFetch<CertificateAuthority[]>(
        `organizations/${nextApp.organizationId}/certificate-authorities`,
      ),
      Promise.all(nextApp.credentials.map(credential =>
        managementFetch<CertificateRecord[]>(`credentials/${credential.id}/certificates`))),
    ]);
    setApp(nextApp);
    setAuthorities(nextAuthorities);
    setCertificates(certificateGroups.flat());
  }, [params.appId]);

  useEffect(() => {
    load().catch(cause => setError(cause instanceof Error ? cause.message : 'Application could not be loaded'));
  }, [load]);

  const credentialOptions = useMemo<CertificateCredentialOption[]>(() =>
    app?.credentials.map(credential => ({
      id: credential.id,
      consumerKey: credential.consumerKey,
      appName: app.name,
    })) ?? [], [app]);

  async function revoke(certificateId: string) {
    if (!window.confirm('Revoke this certificate? The client will immediately lose mTLS access.')) return;
    await managementFetch(`certificates/${certificateId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'unspecified' }),
    });
    await load();
  }

  async function download(certificateId: string) {
    const material = await managementFetch<{ certificatePem: string; chainPem: string | null }>(
      `certificates/${certificateId}/download`,
    );
    const blob = new Blob([`${material.certificatePem}${material.chainPem ?? ''}`], {
      type: 'application/x-pem-file',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${certificateId}.pem`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!app && !error) return <div className="page-loading">Loading application...</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/apps"><ArrowLeft size={15} />Applications</Link>
          <h1>{app?.name ?? 'Application'}</h1>
          <p>Credentials, product grants and client certificate identities.</p>
        </div>
        {app && <StatusPill value={app.status} />}
      </header>
      {error && <div className="alert error">{error}</div>}
      {app?.credentials.map(credential => {
        const credentialCertificates = certificates.filter(certificate =>
          certificate.credential.id === credential.id);
        return (
          <section className="panel application-credential" key={credential.id}>
            <header>
              <div className="credential-title">
                <KeyRound size={18} />
                <div><strong>{credential.consumerKey}</strong><code>{credential.id}</code></div>
              </div>
              <div className="header-actions">
                <StatusPill value={credential.status} />
                <button className="secondary-command" onClick={() => setRegistrationCredentialId(credential.id)}>
                  <Upload size={16} /> Register certificate
                </button>
              </div>
            </header>
            <div className="grant-list application-grants">
              {credential.productGrants.map(grant => (
                <div key={grant.id}>
                  <span>{grant.product.name}</span><StatusPill value={grant.status} />
                  <small>{grant.scopes.join(', ') || 'No scopes'}</small>
                </div>
              ))}
            </div>
            <div className="table-wrap embedded-table">
              <table>
                <thead><tr><th>Certificate</th><th>Authority</th><th>Validity</th><th>Status</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {credentialCertificates.map(certificate => (
                    <tr key={certificate.id}>
                      <td><strong>{certificate.subject ?? 'Unknown subject'}</strong><code>{certificate.fingerprintSha256}</code></td>
                      <td>{certificate.authority?.name ?? 'Legacy'}</td>
                      <td>{new Date(certificate.validFrom).toLocaleDateString()} - {certificate.expiresAt ? new Date(certificate.expiresAt).toLocaleDateString() : 'No expiry'}</td>
                      <td><StatusPill value={certificate.status} /></td>
                      <td className="row-actions">
                        <button title="Download certificate" onClick={() => void download(certificate.id)}><Download size={16} /></button>
                        {certificate.status !== 'revoked' && <button title="Revoke certificate" onClick={() => void revoke(certificate.id)}><ShieldX size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {credentialCertificates.length === 0 && <div className="empty-state">No client certificates registered for this credential.</div>}
            </div>
          </section>
        );
      })}
      {registrationCredentialId && (
        <CertificateRegistrationDialog
          credentials={credentialOptions}
          authorities={authorities}
          initialCredentialId={registrationCredentialId}
          onClose={() => setRegistrationCredentialId(null)}
          onRegistered={load}
        />
      )}
    </>
  );
}
