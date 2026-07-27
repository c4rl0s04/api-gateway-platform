'use client';

import { AlertTriangle, Building2, Clock, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { managementFetch, type Organization } from '@/lib/api-client';
import { StatusPill } from '@/components/status-pill';

interface PkiStatus {
  authorities: Array<{
    id: string;
    organizationId: string;
    name: string;
    status: string;
    expiresAt: string;
    crlNextUpdate: string | null;
  }>;
  expiringCertificates: number;
  recentAudit: Array<{
    id: string;
    action: string;
    resourceType: string;
    actorSubject: string;
    createdAt: string;
  }>;
}

export default function Dashboard() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [status, setStatus] = useState<PkiStatus | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      managementFetch<Organization[]>('organizations'),
      managementFetch<PkiStatus>('pki/status'),
    ])
      .then(([nextOrganizations, nextStatus]) => {
        setOrganizations(nextOrganizations);
        setStatus(nextStatus);
      })
      .catch(cause => setError(cause.message));
  }, []);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Platform overview</h1>
          <p>Organization identity and certificate runtime.</p>
        </div>
      </header>
      {error && <div className="alert error">{error}</div>}
      <div className="metric-grid">
        <div className="metric"><Building2 /><span>Organizations</span><strong>{organizations.length}</strong></div>
        <div className="metric"><ShieldCheck /><span>Trusted authorities</span><strong>{status?.authorities.filter(item => item.status !== 'revoked').length ?? 0}</strong></div>
        <div className="metric"><Clock /><span>Expiring certificates</span><strong>{status?.expiringCertificates ?? 0}</strong></div>
        <div className="metric"><AlertTriangle /><span>CRL attention</span><strong>{status?.authorities.filter(item => !item.crlNextUpdate || new Date(item.crlNextUpdate) <= new Date()).length ?? 0}</strong></div>
      </div>
      <section className="panel audit-panel">
        <header><h2>Security audit</h2></header>
        <table>
          <thead><tr><th>Time</th><th>Action</th><th>Resource</th><th>Actor</th></tr></thead>
          <tbody>
            {status?.recentAudit.map(event => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString()}</td>
                <td><StatusPill value={event.action.split('.').at(-1) ?? event.action} /></td>
                <td>{event.resourceType}</td>
                <td><code>{event.actorSubject}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!status?.recentAudit.length && <div className="empty-state">No audit events.</div>}
      </section>
    </>
  );
}
