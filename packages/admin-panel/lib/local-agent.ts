export type LocalAgentState =
  | { status: 'disconnected'; message?: string }
  | { status: 'connecting'; port: number }
  | { status: 'connected'; client: LocalAgentClient; expiresAt: string }
  | { status: 'error'; message: string };

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
  createdAt: string;
}

interface PairingData {
  port: number;
  nonce: string;
}

export interface LocalAgentSession {
  port: number;
  token: string;
  expiresAt: string;
}

export interface MtlsImportCommandInput {
  name: string;
  keyFile: string;
  certificateFile: string;
  chainFile?: string;
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

interface RpcResponse<T> {
  result?: T;
  error?: { code: string; message: string };
}

export class LocalAgentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LocalAgentError';
  }
}

export class LocalAgentClient {
  constructor(
    readonly port: number,
    private readonly token: string,
  ) {}

  static pairingFromFragment(fragment: string): PairingData | null {
    const parameters = new URLSearchParams(fragment.replace(/^#/, ''));
    const encoded = parameters.get('gatewayctl');
    if (!encoded) return null;
    try {
      const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<PairingData>;
      if (!Number.isInteger(parsed.port)
        || (parsed.port ?? 0) < 1
        || (parsed.port ?? 0) > 65_535
        || typeof parsed.nonce !== 'string'
        || parsed.nonce.length < 32) {
        return null;
      }
      return parsed as PairingData;
    } catch {
      return null;
    }
  }

  static async pair(pairing: PairingData): Promise<{
    client: LocalAgentClient;
    expiresAt: string;
  }> {
    const response = await fetch(`http://127.0.0.1:${pairing.port}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: pairing.nonce }),
    });
    const payload = await response.json() as {
      token?: string;
      expiresAt?: string;
      error?: { code?: string; message?: string };
    };
    if (!response.ok || !payload.token || !payload.expiresAt) {
      throw new LocalAgentError(
        payload.error?.code ?? 'pairing_failed',
        payload.error?.message ?? 'Could not pair with the local agent',
      );
    }
    return {
      client: new LocalAgentClient(pairing.port, payload.token),
      expiresAt: payload.expiresAt,
    };
  }

  static restore(session: LocalAgentSession): LocalAgentClient {
    return new LocalAgentClient(session.port, session.token);
  }

  session(expiresAt: string): LocalAgentSession {
    return { port: this.port, token: this.token, expiresAt };
  }

  listIdentities(): Promise<LocalIdentity[]> {
    return this.rpc('identity.list');
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
    const response = await fetch(`http://127.0.0.1:${this.port}/rpc`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ method, params }),
    });
    const payload = await response.json() as RpcResponse<T>;
    if (!response.ok || payload.error || payload.result === undefined) {
      throw new LocalAgentError(
        payload.error?.code ?? 'agent_request_failed',
        payload.error?.message ?? 'Local agent request failed',
      );
    }
    return payload.result;
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(globalThis.atob(normalized), character =>
    character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
