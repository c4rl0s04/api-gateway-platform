'use client';

import {
  AppWindow,
  Building2,
  KeyRound,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Session {
  authenticated: boolean;
  principal?: {
    memberships: Array<{
      role: string;
      organizationId: string | null;
    }>;
  };
}

export function SessionShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async response => response.ok
        ? response.json() as Promise<Session>
        : { authenticated: false })
      .then(setSession);
  }, []);

  if (!session) {
    return <main className="center-state">Loading session...</main>;
  }
  if (!session.authenticated) {
    return (
      <main className="login-screen">
        <div className="login-panel">
          <ShieldCheck size={32} aria-hidden="true" />
          <h1>API Gateway Administration</h1>
          <a className="primary-command" href="/api/auth/login">
            <LogIn size={17} aria-hidden="true" />
            Sign in
          </a>
        </div>
      </main>
    );
  }
  const role = session.principal?.memberships[0]?.role ?? 'viewer';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={22} aria-hidden="true" />
          <span>Gateway Control</span>
        </div>
        <nav>
          <Link href="/"><Building2 size={17} />Overview</Link>
          <Link href="/apps"><AppWindow size={17} />Applications</Link>
          <Link href="/certificates"><KeyRound size={17} />Certificates</Link>
          <Link href="/authorities"><ShieldCheck size={17} />Authorities</Link>
        </nav>
        <div className="session-meta">
          <span>{role}</span>
          <a href="/api/auth/logout" title="Sign out">
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </a>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
