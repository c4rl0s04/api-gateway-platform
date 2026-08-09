'use client';

import Link from 'next/link';
import { FlaskConical, TestTube2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ApplicationIcon,
  AuthorityIcon,
  CertificateIcon,
  GatewayMark,
  LogoutIcon,
  OverviewIcon,
  ProductIcon,
  ProxyIcon,
  SidebarToggleIcon,
} from '@/components/gateway-icons';
import {
  applySidebarPreference,
  persistSidebarPreference,
  readSidebarPreference,
  type SidebarPreference,
} from '@/lib/sidebar-preference';

const navigation = [
  { href: '/', label: 'Overview', icon: OverviewIcon },
  { href: '/proxies', label: 'Proxies', icon: ProxyIcon },
  { href: '/playground', label: 'Playground', icon: FlaskConical },
  { href: '/lab', label: 'Personal lab', icon: TestTube2 },
  { href: '/apps', label: 'Applications', icon: ApplicationIcon },
  { href: '/products', label: 'API products', icon: ProductIcon },
  { href: '/certificates', label: 'Certificates', icon: CertificateIcon },
  { href: '/authorities', label: 'Authorities', icon: AuthorityIcon },
];

export function CollapsibleSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const [preference, setPreference] = useState<SidebarPreference>('expanded');
  const expanded = preference === 'expanded';

  useEffect(() => {
    const storedPreference = readSidebarPreference(window.localStorage);
    applySidebarPreference(storedPreference, document.documentElement);
    setPreference(storedPreference);
  }, []);

  const toggleSidebar = useCallback(() => {
    setPreference(current => {
      const next = current === 'expanded' ? 'collapsed' : 'expanded';
      applySidebarPreference(next, document.documentElement);
      persistSidebarPreference(next, window.localStorage);
      return next;
    });
  }, []);

  const toggleLabel = expanded ? 'Collapse navigation' : 'Expand navigation';

  return (
    <aside className="sidebar">
      <div className="brand">
        <GatewayMark className="brand-mark" />
        <span className="sidebar-label brand-name">Gateway<br />Control</span>
      </div>

      <button
        className="sidebar-toggle"
        type="button"
        aria-label={toggleLabel}
        aria-expanded={expanded}
        aria-controls="gateway-navigation"
        title={toggleLabel}
        onClick={toggleSidebar}
      >
        <SidebarToggleIcon />
      </button>

      <nav id="gateway-navigation" aria-label="Gateway navigation">
        {navigation.map(item => {
          const Icon = item.icon;
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              href={item.href}
              key={item.href}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
            >
              <Icon />
              <span className="sidebar-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="session-meta">
        <span className="session-role sidebar-label">{role}</span>
        <a href="/api/auth/logout" aria-label="Sign out" title="Sign out">
          <LogoutIcon />
          <span className="sidebar-label">Sign out</span>
        </a>
      </div>
    </aside>
  );
}
