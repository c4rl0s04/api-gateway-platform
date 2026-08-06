'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AccessScreen, AccessScreenState } from '@/components/access-screen';
import { AdminSessionProvider } from '@/components/session-context';
import {
  ApplicationIcon,
  AuthorityIcon,
  CertificateIcon,
  GatewayMark,
  LogoutIcon,
  OverviewIcon,
  ProductIcon,
  ProxyIcon,
} from '@/components/gateway-icons';
import { AdminSession, checkSession } from '@/lib/session';

export function SessionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [accessState, setAccessState] = useState<AccessScreenState>('checking');

  const loadSession = useCallback(async () => {
    setAccessState('checking');
    const result = await checkSession();
    if (result.status === 'authenticated') {
      setSession(result.session);
      return;
    }
    setSession(null);
    setAccessState(result.status);
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (!session) {
    return <AccessScreen state={accessState} onRetry={loadSession} />;
  }
  const role = session.principal?.memberships[0]?.role ?? 'viewer';
  const navigation = [
    { href: '/', label: 'Overview', icon: OverviewIcon },
    { href: '/proxies', label: 'Proxies', icon: ProxyIcon },
    { href: '/apps', label: 'Applications', icon: ApplicationIcon },
    { href: '/products', label: 'API products', icon: ProductIcon },
    { href: '/certificates', label: 'Certificates', icon: CertificateIcon },
    { href: '/authorities', label: 'Authorities', icon: AuthorityIcon },
  ];

  return (
    <AdminSessionProvider session={session}>
      <div className="app-shell">
        <aside className="sidebar">
        <div className="brand">
          <GatewayMark className="brand-mark" />
          <span>Gateway<br />Control</span>
        </div>
        <nav aria-label="Gateway navigation">
          {navigation.map(item => {
            const Icon = item.icon;
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link href={item.href} key={item.href} aria-current={isActive ? 'page' : undefined}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="session-meta">
          <span className="session-role">{role}</span>
          <a href="/api/auth/logout" title="Sign out">
            <LogoutIcon />
            <span>Sign out</span>
          </a>
        </div>
        </aside>
        <main className="workspace">{children}</main>
      </div>
    </AdminSessionProvider>
  );
}
