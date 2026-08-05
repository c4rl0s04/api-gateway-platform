'use client';

import {
  AppWindow,
  Building2,
  KeyRound,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AccessScreen, AccessScreenState } from '@/components/access-screen';
import { AdminSession, checkSession } from '@/lib/session';

export function SessionShell({ children }: { children: React.ReactNode }) {
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
