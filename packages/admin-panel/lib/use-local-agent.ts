'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LocalAgentClient,
  type LocalAgentState,
  type LocalAgentSession,
  type LocalIdentity,
} from '@/lib/local-agent';

const SESSION_KEY = 'gatewayctl_agent_session';

function storedSession(): LocalAgentSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<LocalAgentSession>;
    if (!Number.isInteger(parsed.port)
      || (parsed.port ?? 0) < 1
      || (parsed.port ?? 0) > 65_535
      || typeof parsed.token !== 'string'
      || parsed.token.length < 32
      || typeof parsed.expiresAt !== 'string'
      || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed as LocalAgentSession;
  } catch {
    return null;
  }
}

export interface AgentActivity {
  id: number;
  label: string;
  status: 'running' | 'success' | 'error';
  detail?: string;
  durationMs?: number;
}

export function useLocalAgent() {
  const [state, setState] = useState<LocalAgentState>({ status: 'disconnected' });
  const clientRef = useRef<LocalAgentClient | null>(null);
  const [identities, setIdentities] = useState<LocalIdentity[]>([]);
  const [activity, setActivity] = useState<AgentActivity[]>([]);

  const track = useCallback(async <T,>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const id = Date.now() + Math.random();
    const startedAt = performance.now();
    setActivity(current => [
      ...current.slice(-7),
      { id, label, status: 'running' },
    ]);
    try {
      const result = await operation();
      const durationMs = Math.round(performance.now() - startedAt);
      setActivity(current => current.map(item => item.id === id
        ? { ...item, status: 'success', durationMs }
        : item));
      return result;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      setActivity(current => current.map(item => item.id === id
        ? {
            ...item,
            status: 'error',
            detail: error instanceof Error ? error.message : 'Operation failed',
            durationMs,
          }
        : item));
      throw error;
    }
  }, []);

  const refreshIdentities = useCallback(async (client?: LocalAgentClient) => {
    const active = client ?? clientRef.current ?? undefined;
    if (!active) return [];
    const next = await track('Load local identities', () => active.listIdentities());
    setIdentities(next);
    return next;
  }, [track]);

  const connect = useCallback(async () => {
    const pairing = LocalAgentClient.pairingFromFragment(window.location.hash);
    if (!pairing) {
      setState({
        status: 'error',
        message: 'Run `npm run gatewayctl -- agent start` to open a fresh pairing link.',
      });
      return;
    }
    setState({ status: 'connecting', port: pairing.port });
    try {
      const paired = await track(
        'Pair local agent',
        () => LocalAgentClient.pair(pairing),
      );
      clientRef.current = paired.client;
      setState({ status: 'connected', ...paired });
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify(paired.client.session(paired.expiresAt)),
      );
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      await refreshIdentities(paired.client);
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not connect to gatewayctl',
      });
    }
  }, [refreshIdentities, track]);

  useEffect(() => {
    if (LocalAgentClient.pairingFromFragment(window.location.hash)) {
      void connect();
      return;
    }
    const session = storedSession();
    if (!session) return;
    const client = LocalAgentClient.restore(session);
    clientRef.current = client;
    setState({ status: 'connected', client, expiresAt: session.expiresAt });
    void refreshIdentities(client).catch(() => {
      clientRef.current = null;
      sessionStorage.removeItem(SESSION_KEY);
      setIdentities([]);
      setState({ status: 'disconnected', message: 'The local agent session expired.' });
    });
  }, [connect, refreshIdentities]);

  return {
    state,
    identities,
    activity,
    connect,
    refreshIdentities,
    track,
  };
}
