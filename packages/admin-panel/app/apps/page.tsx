'use client';

import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OrganizationSelect } from '@/components/organization-select';
import { StatusPill } from '@/components/status-pill';
import {
  managementFetch,
  type DeveloperApp,
  type Organization,
} from '@/lib/api-client';

export default function AppsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [apps, setApps] = useState<DeveloperApp[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    managementFetch<Organization[]>('organizations')
      .then(items => {
        setOrganizations(items);
        setOrganizationId(items[0]?.id ?? '');
      })
      .catch(cause => setError(cause.message));
  }, []);
  useEffect(() => {
    if (!organizationId) return;
    managementFetch<DeveloperApp[]>(`organizations/${organizationId}/apps`)
      .then(setApps)
      .catch(cause => setError(cause.message));
  }, [organizationId]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Registered clients, grants and mTLS credentials.</p>
        </div>
        <OrganizationSelect
          organizations={organizations}
          value={organizationId}
          onChange={setOrganizationId}
        />
      </header>
      {error && <div className="alert error">{error}</div>}
      <div className="item-list">
        {apps.map(app => (
          <section className="panel entity-panel" key={app.id}>
            <header>
              <div>
                <h2>{app.name}</h2>
                <code>{app.id}</code>
              </div>
              <StatusPill value={app.status} />
            </header>
            {app.credentials.map(credential => (
              <div className="credential-row" key={credential.id}>
                <div className="credential-title">
                  <KeyRound size={17} aria-hidden="true" />
                  <div>
                    <strong>{credential.consumerKey}</strong>
                    <code>{credential.id}</code>
                  </div>
                </div>
                <div className="grant-list">
                  {credential.productGrants.map(grant => (
                    <div key={grant.id}>
                      <ShieldCheck size={15} aria-hidden="true" />
                      <span>{grant.product.name}</span>
                      <StatusPill value={grant.status} />
                      <small>{grant.scopes.join(', ') || 'No scopes'}</small>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <footer className="entity-panel-footer">
              <Link href={`/apps/${app.id}`}>Open application <ArrowRight size={16} /></Link>
            </footer>
          </section>
        ))}
        {!error && apps.length === 0 && (
          <section className="panel empty-state">No applications found.</section>
        )}
      </div>
    </>
  );
}
