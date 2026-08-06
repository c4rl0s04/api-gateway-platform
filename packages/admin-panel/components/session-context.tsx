'use client';

import { createContext, useContext } from 'react';
import type { AdminSession } from '@/lib/session';

const SessionContext = createContext<AdminSession | null>(null);

export function AdminSessionProvider({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useAdminSession(): AdminSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useAdminSession must be used inside SessionShell');
  return session;
}
