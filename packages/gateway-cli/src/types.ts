import type { JWK } from 'jose';

export type IdentityType = 'jwt' | 'mtls';
export type IdentitySource = 'generated' | 'file';

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
