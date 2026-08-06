'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ApplicationIcon,
  ArrowIcon,
  AuthorityIcon,
  CertificateIcon,
  ClientIcon,
  ProductIcon,
  ProxyIcon,
  UpstreamIcon,
} from '@/components/gateway-icons';
import { managementFetch, type Organization } from '@/lib/api-client';

interface PkiStatus {
  authorities: Array<{
    id: string;
    status: string;
    crlNextUpdate: string | null;
  }>;
  expiringCertificates: number;
  recentAudit: Array<{
    id: string;
    action: string;
    resourceType: string;
    createdAt: string;
  }>;
}

const routeStages = [
  {
    name: 'Client',
    description: 'Requests enter through registered applications.',
    icon: ClientIcon,
    links: [{ href: '/apps', label: 'Applications', icon: ApplicationIcon }],
  },
  {
    name: 'Edge',
    description: 'Host and path resolve to an active proxy revision.',
    icon: ProxyIcon,
    links: [{ href: '/proxies', label: 'Proxies', icon: ProxyIcon }],
  },
  {
    name: 'Policies',
    description: 'Identity, traffic, and mediation rules run in order.',
    icon: AuthorityIcon,
    links: [{ href: '/products', label: 'API products', icon: ProductIcon }],
  },
  {
    name: 'Upstream',
    description: 'Approved traffic is forwarded without changing its contract.',
    icon: UpstreamIcon,
    links: [
      { href: '/certificates', label: 'Certificates', icon: CertificateIcon },
      { href: '/authorities', label: 'Authorities', icon: AuthorityIcon },
    ],
  },
];

export default function Dashboard() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [status, setStatus] = useState<PkiStatus | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      managementFetch<Organization[]>('organizations'),
      managementFetch<PkiStatus>('pki/status'),
    ])
      .then(([nextOrganizations, nextStatus]) => {
        setOrganizations(nextOrganizations);
        setStatus(nextStatus);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'The platform status could not be loaded.'))
      .finally(() => setIsLoading(false));
  }, []);

  const activeAuthorities = status?.authorities.filter(item => item.status !== 'revoked').length ?? 0;

  return (
    <div className="home-page">
      <header className="home-hero">
        <div>
          <h1>See the route.<br />Control the edge.</h1>
          <p>Follow every request from client identity to upstream service, then move directly to the control that shapes it.</p>
        </div>
        <div className="home-context" aria-label="Platform context">
          <span>Control plane</span>
          <strong>{isLoading ? '—' : organizations.length} organizations</strong>
        </div>
      </header>

      {error && <div className="alert error" role="alert">{error}</div>}

      <section className="route-section" aria-labelledby="route-heading">
        <h2 id="route-heading">Request path</h2>
        <div className="route-map">
          {routeStages.map((stage, index) => {
            const StageIcon = stage.icon;
            return (
              <article className="route-stage" key={stage.name}>
                <div className="route-track" aria-hidden="true">
                  <span className="route-node"><StageIcon /></span>
                  {index < routeStages.length - 1 && <span className="route-line"><ArrowIcon /></span>}
                </div>
                <h3>{stage.name}</h3>
                <p>{stage.description}</p>
                <div className="route-links">
                  {stage.links.map(item => {
                    const LinkIcon = item.icon;
                    return (
                      <Link href={item.href} key={item.href}>
                        <LinkIcon />
                        <span>{item.label}</span>
                        <ArrowIcon />
                      </Link>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="gateway-summary" aria-labelledby="summary-heading">
        <div className="summary-intro">
          <h2 id="summary-heading">Architecture that stays explicit.</h2>
          <p>Routing, policy, and trust remain separate concerns, so every change has a visible operational boundary.</p>
        </div>
        <dl className="summary-list">
          <div><dt>Route precisely</dt><dd>Environment hostnames select the runtime before longest-prefix matching resolves the proxy.</dd></div>
          <div><dt>Apply policy in order</dt><dd>Authentication, authorization, traffic, and mediation rules form an inspectable request pipeline.</dd></div>
          <div><dt>Trust each client</dt><dd>OIDC protects the control plane while certificates and product grants scope runtime access.</dd></div>
        </dl>
      </section>

      <section className="runtime-strip" aria-label="Current security snapshot">
        <div><span>Organizations</span><strong>{isLoading ? '—' : organizations.length}</strong></div>
        <div><span>Trusted authorities</span><strong>{status ? activeAuthorities : '—'}</strong></div>
        <div><span>Certificates expiring</span><strong>{status?.expiringCertificates ?? '—'}</strong></div>
        <div><span>Recent audit events</span><strong>{status?.recentAudit.length ?? '—'}</strong></div>
      </section>
    </div>
  );
}
