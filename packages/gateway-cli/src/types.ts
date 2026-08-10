import type { JWK } from 'jose';

export type IdentityType = 'jwt' | 'mtls';
export type IdentitySource = 'generated' | 'file';

export const AGENT_PROTOCOL_VERSION = 2;
export const DEFAULT_AGENT_PORT = 43_127;
export const AGENT_CAPABILITIES = [
  'agent.status',
  'identity.list',
  'identity.remove',
  'jwt.generateKey',
  'jwt.getPublicJwk',
  'jwt.signAssertion',
  'mtls.generateKeyAndCsr',
  'mtls.getCsr',
  'mtls.installCertificate',
  'mtls.executeRequest',
] as const;

export interface AgentStatus {
  name: 'gatewayctl';
  protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  agentVersion: string;
  instanceId: string;
  capabilities: readonly string[];
}

export interface LocalIdentity {
  id: string;
  name: string;
  type: IdentityType;
  source: IdentitySource;
  algorithm: 'RS256' | 'rsa' | 'ec';
  fingerprint: string;
  consumerKey?: string;
  publicJwk?: JWK;
  privateKey: {
    kind: 'encrypted' | 'file';
    location: string;
  };
  certificateFile?: string;
  chainFile?: string;
  csrFile?: string;
  createdAt: string;
}

export interface PublicIdentity {
  id: string;
  name: string;
  type: IdentityType;
  source: IdentitySource;
  algorithm: LocalIdentity['algorithm'];
  fingerprint: string;
  consumerKey?: string;
  publicJwk?: JWK;
  hasCertificate: boolean;
  certificateFingerprintSha256?: string;
  certificateExpiresAt?: string;
  createdAt: string;
}

export interface AgentProfile {
  allowedOrigins: string[];
  allowedAudienceHosts: string[];
  playgroundUrl: string;
  gatewayCaCertificateFile?: string;
  port: number;
  trustedClientDays: number;
}

export interface AgentOperationRequest {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface AgentOperationResponse {
  id?: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export class GatewayCtlError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayCtlError';
  }
}
