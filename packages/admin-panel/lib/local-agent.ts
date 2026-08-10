import {
  signAgentProof,
  type BrowserAgentIdentity,
} from '@/lib/browser-agent-identity';

export const AGENT_PROTOCOL_VERSION = 2;
export const DEFAULT_AGENT_PORT = 43_127;

export type LocalAgentState =
  | { status: 'checking'; port: number }
  | { status: 'unavailable'; port: number; message: string }
  | { status: 'approvalRequired'; port: number; agent: AgentStatus }
  | { status: 'pairing'; port: number; agent: AgentStatus; pairing: PendingPairing; message?: string }
  | { status: 'connected'; client: LocalAgentClient; expiresAt: string; trustedUntil: string }
  | { status: 'incompatible'; port: number; foundVersion: number }
  | { status: 'error'; port: number; message: string };

export interface AgentStatus {
  name: 'gatewayctl';
  protocolVersion: number;
  agentVersion: string;
  instanceId: string;
  capabilities: string[];
}

export interface PendingPairing {
  pairingId: string;
  nonce: string;
  expiresAt: string;
}

interface BrowserSession {
  token: string;
  expiresAt: string;
  trustedUntil: string;
}

export interface LocalIdentity {
  id: string;
  name: string;
  type: 'jwt' | 'mtls';
  source: 'generated' | 'file';
  algorithm: 'RS256' | 'rsa' | 'ec';
  fingerprint: string;
  consumerKey?: string;
  publicJwk?: JsonWebKey;
  hasCertificate: boolean;
  certificateFingerprintSha256?: string;
  certificateExpiresAt?: string;
  createdAt: string;
}

export interface MtlsImportCommandInput {
  name: string;
  keyFile: string;
  certificateFile: string;
  chainFile?: string;
}

interface RpcResponse<T> {
  result?: T;
  error?: { code: string; message: string };
}

export class LocalAgentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LocalAgentError';
  }
}

export class LocalAgentClient {
  private renewal: Promise<void> | null = null;

  private constructor(
    readonly port: number,
    public agent: AgentStatus,
    private readonly identity: BrowserAgentIdentity,
    private sessionValue: BrowserSession,
  ) {}

  get expiresAt(): string {
    return this.sessionValue.expiresAt;
  }

  get trustedUntil(): string {
    return this.sessionValue.trustedUntil;
  }

  static async discover(port: number): Promise<AgentStatus> {
    const response = await agentFetch(port, '/v1/status', { method: 'GET' }, 1_500);
    const payload = await jsonPayload<Partial<AgentStatus>>(response);
    if (!response.ok || payload.name !== 'gatewayctl' || typeof payload.protocolVersion !== 'number') {
      throw new LocalAgentError('agent_unavailable', 'No compatible gatewayctl agent answered');
    }
    return payload as AgentStatus;
  }

  static async connectTrusted(
    port: number,
    agent: AgentStatus,
    identity: BrowserAgentIdentity,
  ): Promise<LocalAgentClient> {
    const session = await createTrustedSession(port, agent, identity);
    return new LocalAgentClient(port, agent, identity, session);
  }

  static async requestPairing(
    port: number,
    identity: BrowserAgentIdentity,
  ): Promise<PendingPairing> {
    return request<PendingPairing>(port, '/v1/pairings', {
      clientId: identity.clientId,
      label: identity.label,
      publicJwk: identity.publicJwk,
    }, undefined, 3_000);
  }

  static async completePairing(input: {
    port: number;
    agent: AgentStatus;
    identity: BrowserAgentIdentity;
    pairing: PendingPairing;
    code: string;
  }): Promise<LocalAgentClient> {
    const signature = await signAgentProof(input.identity, pairingMessage({
      pairingId: input.pairing.pairingId,
      nonce: input.pairing.nonce,
      origin: window.location.origin,
      instanceId: input.agent.instanceId,
      clientId: input.identity.clientId,
    }));
    const session = await request<BrowserSession>(
      input.port,
      `/v1/pairings/${encodeURIComponent(input.pairing.pairingId)}/complete`,
      { code: input.code, signature },
    );
    return new LocalAgentClient(input.port, input.agent, input.identity, session);
  }

  status(): Promise<AgentStatus> {
    return LocalAgentClient.discover(this.port);
  }

  listIdentities(): Promise<LocalIdentity[]> {
    return this.rpc('identity.list');
  }

  removeIdentity(identityId: string): Promise<{ removed: true }> {
    return this.rpc('identity.remove', { identityId });
  }

  generateJwtKey(name: string, consumerKey: string): Promise<LocalIdentity> {
    return this.rpc('jwt.generateKey', { name, consumerKey });
  }

  signAssertion(input: {
    identityId: string;
    consumerKey: string;
    kid: string;
    audience: string;
    ttlSeconds?: number;
  }): Promise<{
    assertion: string;
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
    expiresAt: string;
  }> {
    return this.rpc('jwt.signAssertion', input);
  }

  generateMtlsIdentity(input: {
    name: string;
    credentialId: string;
    algorithm?: 'rsa' | 'ec';
  }): Promise<{ identity: LocalIdentity; csr: string }> {
    return this.rpc('mtls.generateKeyAndCsr', input);
  }

  getCsr(identityId: string): Promise<{ csr: string }> {
    return this.rpc('mtls.getCsr', { identityId });
  }

  installCertificate(input: {
    identityId: string;
    certificatePem: string;
    chainPem?: string;
  }): Promise<LocalIdentity> {
    return this.rpc('mtls.installCertificate', input);
  }

  executeMtlsRequest(input: {
    identityId: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string | string[]>;
    body: string;
  }> {
    return this.rpc('mtls.executeRequest', input);
  }

  private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    await this.ensureSession();
    try {
      return await request<T>(this.port, '/v1/rpc', { method, params }, this.sessionValue.token, 15_000);
    } catch (error) {
      if (!(error instanceof LocalAgentError) || error.code !== 'session_invalid') throw error;
      await this.renewSession();
      return request<T>(this.port, '/v1/rpc', { method, params }, this.sessionValue.token, 15_000);
    }
  }

  private async ensureSession(): Promise<void> {
    if (new Date(this.sessionValue.expiresAt).getTime() - Date.now() > 60_000) return;
    await this.renewSession();
  }

  private async renewSession(): Promise<void> {
    if (!this.renewal) {
      this.renewal = LocalAgentClient.discover(this.port)
        .then(agent => {
          if (agent.protocolVersion !== AGENT_PROTOCOL_VERSION) {
            throw new LocalAgentError('agent_incompatible', `gatewayctl protocol ${agent.protocolVersion} is not supported`);
          }
          this.agent = agent;
          return createTrustedSession(this.port, agent, this.identity);
        })
        .then(session => { this.sessionValue = session; })
        .finally(() => { this.renewal = null; });
    }
    await this.renewal;
  }
}

async function createTrustedSession(
  port: number,
  agent: AgentStatus,
  identity: BrowserAgentIdentity,
): Promise<BrowserSession> {
  const challenge = await request<{
    challengeId: string;
    nonce: string;
  }>(port, '/v1/sessions/challenges', { clientId: identity.clientId });
  const signature = await signAgentProof(identity, sessionMessage({
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    origin: window.location.origin,
    instanceId: agent.instanceId,
    clientId: identity.clientId,
  }));
  return request<BrowserSession>(port, '/v1/sessions', {
    challengeId: challenge.challengeId,
    signature,
  });
}

async function request<T>(
  port: number,
  path: string,
  body: Record<string, unknown>,
  token?: string,
  timeoutMs = 5_000,
): Promise<T> {
  const response = await agentFetch(port, path, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }, timeoutMs);
  const payload = await jsonPayload<RpcResponse<T> & T>(response);
  if (!response.ok || payload.error) {
    throw new LocalAgentError(
      payload.error?.code ?? `agent_http_${response.status}`,
      payload.error?.message ?? 'Local agent request failed',
    );
  }
  if ('result' in payload) {
    if (payload.result === undefined) throw new LocalAgentError('agent_response_invalid', 'Local agent response is invalid');
    return payload.result;
  }
  return payload as T;
}

async function agentFetch(
  port: number,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      signal: controller.signal,
      targetAddressSpace: 'local',
    } as RequestInit & { targetAddressSpace: 'local' });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new LocalAgentError('agent_timeout', 'The local agent did not answer in time');
    }
    throw new LocalAgentError(
      'agent_unavailable',
      'The local agent is unavailable or local network access was blocked by the browser',
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

async function jsonPayload<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new LocalAgentError('agent_response_invalid', 'Local agent returned an invalid response');
  }
}

function pairingMessage(input: {
  pairingId: string;
  nonce: string;
  origin: string;
  instanceId: string;
  clientId: string;
}): string {
  return JSON.stringify(['gatewayctl-pairing-v2', input.pairingId, input.nonce, input.origin, input.instanceId, input.clientId]);
}

function sessionMessage(input: {
  challengeId: string;
  nonce: string;
  origin: string;
  instanceId: string;
  clientId: string;
}): string {
  return JSON.stringify(['gatewayctl-session-v2', input.challengeId, input.nonce, input.origin, input.instanceId, input.clientId]);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildMtlsImportCommand(input: MtlsImportCommandInput): string {
  const argumentsList = [
    ['--name', input.name],
    ['--type', 'mtls'],
    ['--key', input.keyFile],
    ['--certificate', input.certificateFile],
    ...(input.chainFile ? [['--chain', input.chainFile]] : []),
  ];
  return [
    'npm run gatewayctl -- keys add \\',
    ...argumentsList.map(([flag, value], index) =>
      `  ${flag} ${shellQuote(value)}${index < argumentsList.length - 1 ? ' \\' : ''}`),
  ].join('\n');
}
