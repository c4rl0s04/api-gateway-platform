'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadOrCreateBrowserAgentIdentity, type BrowserAgentIdentity } from '@/lib/browser-agent-identity';
import {
  AGENT_PROTOCOL_VERSION,
  DEFAULT_AGENT_PORT,
  LocalAgentClient,
  LocalAgentError,
  type LocalAgentState,
  type LocalIdentity,
} from '@/lib/local-agent';

const PORT_KEY = 'gatewayctl_agent_port';
const CHANNEL_NAME = 'gatewayctl-agent-v2';

export interface AgentActivity {
  id: number;
  label: string;
  status: 'running' | 'success' | 'error';
  detail?: string;
  durationMs?: number;
}

export interface LocalAgentController {
  state: LocalAgentState;
  identities: LocalIdentity[];
  activity: AgentActivity[];
  port: number;
  dialogOpen: boolean;
  connect(): Promise<void>;
  closeDialog(): void;
  approvePairing(code: string): Promise<void>;
  setPort(port: number): void;
  refreshIdentities(client?: LocalAgentClient): Promise<LocalIdentity[]>;
  track<T>(label: string, operation: () => Promise<T>): Promise<T>;
}

export const LocalAgentContext = createContext<LocalAgentController | null>(null);

export function useLocalAgent(): LocalAgentController {
  const context = useContext(LocalAgentContext);
  if (!context) throw new Error('useLocalAgent must be used inside LocalAgentProvider');
  return context;
}

export function useLocalAgentController(): LocalAgentController {
  const [port, setPortState] = useState(DEFAULT_AGENT_PORT);
  const [state, setState] = useState<LocalAgentState>({ status: 'checking', port: DEFAULT_AGENT_PORT });
  const [identities, setIdentities] = useState<LocalIdentity[]>([]);
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const identityRef = useRef<BrowserAgentIdentity | null>(null);
  const clientRef = useRef<LocalAgentClient | null>(null);
  const probeRef = useRef<Promise<void> | null>(null);

  const track = useCallback(async <T,>(label: string, operation: () => Promise<T>): Promise<T> => {
    const id = Date.now() + Math.random();
    const startedAt = performance.now();
    setActivity(current => [...current.slice(-7), { id, label, status: 'running' }]);
    try {
      const result = await operation();
      setActivity(current => current.map(item => item.id === id
        ? { ...item, status: 'success', durationMs: Math.round(performance.now() - startedAt) }
        : item));
      return result;
    } catch (error) {
      setActivity(current => current.map(item => item.id === id
        ? {
            ...item,
            status: 'error',
            detail: error instanceof Error ? error.message : 'Operation failed',
            durationMs: Math.round(performance.now() - startedAt),
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

  const applyConnected = useCallback(async (client: LocalAgentClient) => {
    clientRef.current = client;
    setState({
      status: 'connected',
      client,
      expiresAt: client.expiresAt,
      trustedUntil: client.trustedUntil,
    });
    await refreshIdentities(client);
  }, [refreshIdentities]);

  const probe = useCallback(async (targetPort = port) => {
    if (probeRef.current) return probeRef.current;
    const operation = (async () => {
      setState(current => current.status === 'connected'
        ? current
        : { status: 'checking', port: targetPort });
      try {
        const identity = identityRef.current ?? await loadOrCreateBrowserAgentIdentity();
        identityRef.current = identity;
        const agent = await LocalAgentClient.discover(targetPort);
        if (agent.protocolVersion !== AGENT_PROTOCOL_VERSION) {
          clientRef.current = null;
          setState({ status: 'incompatible', port: targetPort, foundVersion: agent.protocolVersion });
          return;
        }
        try {
          const client = await LocalAgentClient.connectTrusted(targetPort, agent, identity);
          await applyConnected(client);
        } catch (error) {
          if (error instanceof LocalAgentError && error.code === 'client_not_registered') {
            clientRef.current = null;
            setIdentities([]);
            setState({ status: 'approvalRequired', port: targetPort, agent });
            return;
          }
          throw error;
        }
      } catch (error) {
        clientRef.current = null;
        setIdentities([]);
        if (error instanceof LocalAgentError
          && ['agent_unavailable', 'agent_timeout'].includes(error.code)) {
          setState({ status: 'unavailable', port: targetPort, message: error.message });
        } else {
          setState({
            status: 'error',
            port: targetPort,
            message: error instanceof Error ? error.message : 'Could not connect to gatewayctl',
          });
        }
      }
    })().finally(() => { probeRef.current = null; });
    probeRef.current = operation;
    return operation;
  }, [applyConnected, port]);

  const connect = useCallback(async () => {
    setDialogOpen(true);
    const identity = identityRef.current ?? await loadOrCreateBrowserAgentIdentity();
    identityRef.current = identity;
    try {
      const agent = await LocalAgentClient.discover(port);
      if (agent.protocolVersion !== AGENT_PROTOCOL_VERSION) {
        setState({ status: 'incompatible', port, foundVersion: agent.protocolVersion });
        return;
      }
      try {
        await applyConnected(await LocalAgentClient.connectTrusted(port, agent, identity));
      } catch (error) {
        if (!(error instanceof LocalAgentError) || error.code !== 'client_not_registered') throw error;
        const pairing = await track(
          'Request browser approval',
          () => LocalAgentClient.requestPairing(port, identity),
        );
        setState({ status: 'pairing', port, agent, pairing });
      }
    } catch (error) {
      setState({
        status: error instanceof LocalAgentError && ['agent_unavailable', 'agent_timeout'].includes(error.code)
          ? 'unavailable'
          : 'error',
        port,
        message: error instanceof Error ? error.message : 'Could not connect to gatewayctl',
      });
    }
  }, [applyConnected, port, track]);

  const approvePairing = useCallback(async (code: string) => {
    if (state.status !== 'pairing' || !identityRef.current) return;
    try {
      const client = await track('Approve browser', () => LocalAgentClient.completePairing({
        port: state.port,
        agent: state.agent,
        identity: identityRef.current!,
        pairing: state.pairing,
        code,
      }));
      await applyConnected(client);
    } catch (error) {
      setState({
        status: 'pairing',
        port: state.port,
        agent: state.agent,
        pairing: state.pairing,
        message: error instanceof Error ? error.message : 'Browser approval failed',
      });
    }
  }, [applyConnected, state, track]);

  const setPort = useCallback((nextPort: number) => {
    if (!Number.isInteger(nextPort) || nextPort < 1 || nextPort > 65_535) return;
    localStorage.setItem(PORT_KEY, String(nextPort));
    setPortState(nextPort);
    clientRef.current = null;
    setIdentities([]);
    setState({ status: 'checking', port: nextPort });
  }, []);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  useEffect(() => {
    const stored = Number(localStorage.getItem(PORT_KEY));
    const initialPort = Number.isInteger(stored) && stored > 0 && stored <= 65_535
      ? stored
      : DEFAULT_AGENT_PORT;
    setPortState(initialPort);
    void probe(initialPort);
  }, [probe]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (state.status === 'pairing') return;
      if (state.status === 'connected') {
        void state.client.status().then(agent => {
          if (agent.instanceId !== state.client.agent.instanceId) void probe(state.client.port);
        }).catch(() => void probe(state.client.port));
      } else if (state.status === 'unavailable') {
        void probe(state.port);
      }
    }, state.status === 'connected' ? 10_000 : 5_000);
    const retry = () => void probe(port);
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
    };
  }, [port, probe, state]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = event => {
      if (event.data === 'identities-changed' && clientRef.current) void refreshIdentities();
      if (event.data === 'agent-reconnect') void probe(port);
    };
    return () => channel.close();
  }, [port, probe, refreshIdentities]);

  return {
    state,
    identities,
    activity,
    port,
    dialogOpen,
    connect,
    closeDialog,
    approvePairing,
    setPort,
    refreshIdentities,
    track,
  };
}
