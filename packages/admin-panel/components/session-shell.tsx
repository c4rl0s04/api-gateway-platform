'use client';

import { useCallback, useEffect, useState } from 'react';
import { AccessScreen, AccessScreenState } from '@/components/access-screen';
import { CollapsibleSidebar } from '@/components/collapsible-sidebar';
import { AdminSessionProvider } from '@/components/session-context';
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
    <AdminSessionProvider session={session}>
      <div className="app-shell">
        <CollapsibleSidebar role={role} />
        <main className="workspace">{children}</main>
      </div>
    </AdminSessionProvider>
  );
}
