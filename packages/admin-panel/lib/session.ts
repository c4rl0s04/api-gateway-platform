export interface AdminSession {
  authenticated: boolean;
  principal?: {
    memberships: Array<{
      role: string;
      organizationId: string | null;
    }>;
  };
}

export type SessionCheck =
  | { status: 'authenticated'; session: AdminSession }
  | { status: 'unauthenticated' }
  | { status: 'error' };

export async function checkSession(
  fetcher: typeof fetch = fetch,
): Promise<SessionCheck> {
  try {
    const response = await fetcher('/api/auth/session', { cache: 'no-store' });
    if (response.status === 401) {
      return { status: 'unauthenticated' };
    }
    if (!response.ok) {
      return { status: 'error' };
    }

    const session = await response.json() as AdminSession;
    return session.authenticated
      ? { status: 'authenticated', session }
      : { status: 'unauthenticated' };
  } catch {
    return { status: 'error' };
  }
}
