import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  verify,
  type JsonWebKey as NodeJsonWebKey,
} from 'node:crypto';
import type { JWK } from 'jose';
import type { TrustedClientStore } from './trusted-client-store.js';
import { GatewayCtlError } from './types.js';

const PAIRING_TTL_MS = 2 * 60 * 1000;
const CHALLENGE_TTL_MS = 30 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;
const PAIRING_COOLDOWN_MS = 10 * 1000;
const MAX_PAIRINGS = 5;
const MAX_CODE_ATTEMPTS = 5;

interface PendingPairing {
  id: string;
  clientId: string;
  origin: string;
  label: string;
  publicJwk: JWK;
  nonce: string;
  codeHash: Buffer;
  attempts: number;
  createdAt: number;
  expiresAt: number;
}

interface SessionChallenge {
  id: string;
  clientId: string;
  origin: string;
  nonce: string;
  expiresAt: number;
}

interface BrowserSession {
  tokenHash: Buffer;
  clientId: string;
  origin: string;
  expiresAt: number;
}

export interface PairingPrompt {
  pairingId: string;
  origin: string;
  label: string;
  code: string;
  expiresAt: string;
}

export interface BrowserSessionResult {
  token: string;
  expiresAt: string;
  trustedUntil: string;
}

export class BrowserAgentAuth {
  private readonly pairings = new Map<string, PendingPairing>();
  private readonly challenges = new Map<string, SessionChallenge>();
  private readonly sessions = new Map<string, BrowserSession>();

  constructor(
    private readonly trustedClients: TrustedClientStore,
    private readonly instanceId: string,
    private readonly onPairingPrompt: (prompt: PairingPrompt) => void,
    private readonly now: () => number = Date.now,
  ) {}

  async createPairing(input: {
    clientId: string;
    origin: string;
    label: string;
    publicJwk: JWK;
  }): Promise<{ pairingId: string; nonce: string; expiresAt: string }> {
    this.cleanup();
    validatePublicKey(input.publicJwk);
    if (await this.trustedClients.findActive(input.clientId, input.origin, new Date(this.now()))) {
      throw new GatewayCtlError('client_already_registered', 'Browser client is already trusted');
    }
    const duplicate = [...this.pairings.values()].find(pairing =>
      pairing.clientId === input.clientId && pairing.origin === input.origin);
    if (duplicate && this.now() - duplicate.createdAt < PAIRING_COOLDOWN_MS) {
      throw new GatewayCtlError('pairing_pending', 'A pairing request is already pending');
    }
    if (this.pairings.size >= MAX_PAIRINGS) {
      throw new GatewayCtlError('pairing_limit_reached', 'Too many pairing requests are pending');
    }
    const code = pairingCode();
    const pairing: PendingPairing = {
      id: randomUUID(),
      clientId: input.clientId,
      origin: input.origin,
      label: input.label,
      publicJwk: input.publicJwk,
      nonce: randomBytes(32).toString('base64url'),
      codeHash: digest(code),
      attempts: 0,
      createdAt: this.now(),
      expiresAt: this.now() + PAIRING_TTL_MS,
    };
    this.pairings.set(pairing.id, pairing);
    const expiresAt = new Date(pairing.expiresAt).toISOString();
    this.onPairingPrompt({
      pairingId: pairing.id,
      origin: pairing.origin,
      label: pairing.label,
      code,
      expiresAt,
    });
    return { pairingId: pairing.id, nonce: pairing.nonce, expiresAt };
  }

  async completePairing(input: {
    pairingId: string;
    code: string;
    signature: string;
  }): Promise<BrowserSessionResult> {
    this.cleanup();
    const pairing = this.pairings.get(input.pairingId);
    if (!pairing) throw new GatewayCtlError('pairing_expired', 'Pairing request is missing or expired');
    pairing.attempts += 1;
    if (!safeEqual(digest(normalizePairingCode(input.code)), pairing.codeHash)) {
      if (pairing.attempts >= MAX_CODE_ATTEMPTS) this.pairings.delete(pairing.id);
      throw new GatewayCtlError('pairing_code_invalid', 'Pairing code is invalid');
    }
    verifyProof(
      pairing.publicJwk,
      pairingMessage(pairing, this.instanceId),
      input.signature,
    );
    this.pairings.delete(pairing.id);
    const client = await this.trustedClients.register({
      id: pairing.clientId,
      origin: pairing.origin,
      label: pairing.label,
      publicJwk: pairing.publicJwk,
      now: new Date(this.now()),
    });
    return this.issueSession(pairing.clientId, pairing.origin, client.expiresAt);
  }

  async createSessionChallenge(input: {
    clientId: string;
    origin: string;
  }): Promise<{ challengeId: string; nonce: string; expiresAt: string }> {
    this.cleanup();
    const client = await this.trustedClients.findActive(
      input.clientId,
      input.origin,
      new Date(this.now()),
    );
    if (!client) throw new GatewayCtlError('client_not_registered', 'Browser client is not trusted');
    const challenge: SessionChallenge = {
      id: randomUUID(),
      clientId: input.clientId,
      origin: input.origin,
      nonce: randomBytes(32).toString('base64url'),
      expiresAt: this.now() + CHALLENGE_TTL_MS,
    };
    this.challenges.set(challenge.id, challenge);
    return {
      challengeId: challenge.id,
      nonce: challenge.nonce,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
    };
  }

  async completeSession(input: {
    challengeId: string;
    signature: string;
  }): Promise<BrowserSessionResult> {
    this.cleanup();
    const challenge = this.challenges.get(input.challengeId);
    if (!challenge) throw new GatewayCtlError('challenge_expired', 'Session challenge is missing or expired');
    this.challenges.delete(challenge.id);
    const client = await this.trustedClients.findActive(
      challenge.clientId,
      challenge.origin,
      new Date(this.now()),
    );
    if (!client) throw new GatewayCtlError('client_not_registered', 'Browser client is not trusted');
    verifyProof(client.publicJwk, sessionMessage(challenge, this.instanceId), input.signature);
    await this.trustedClients.touch(client.id, client.origin, new Date(this.now()));
    return this.issueSession(client.id, client.origin, client.expiresAt);
  }

  async authorize(token: string, origin: string): Promise<{ clientId: string; expiresAt: string }> {
    this.cleanup();
    const tokenHash = digest(token);
    const entry = [...this.sessions.entries()].find(([, session]) =>
      session.origin === origin && safeEqual(session.tokenHash, tokenHash));
    if (!entry) throw new GatewayCtlError('session_invalid', 'Agent session is missing or expired');
    const [sessionId, session] = entry;
    const client = await this.trustedClients.findActive(
      session.clientId,
      origin,
      new Date(this.now()),
    );
    if (!client) {
      this.sessions.delete(sessionId);
      throw new GatewayCtlError('session_invalid', 'Trusted browser authorization was revoked or expired');
    }
    return { clientId: session.clientId, expiresAt: new Date(session.expiresAt).toISOString() };
  }

  private issueSession(clientId: string, origin: string, trustedUntil: string): BrowserSessionResult {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + SESSION_TTL_MS;
    this.sessions.set(randomUUID(), {
      tokenHash: digest(token),
      clientId,
      origin,
      expiresAt,
    });
    return { token, expiresAt: new Date(expiresAt).toISOString(), trustedUntil };
  }

  private cleanup(): void {
    const now = this.now();
    for (const [id, pairing] of this.pairings) if (pairing.expiresAt <= now) this.pairings.delete(id);
    for (const [id, challenge] of this.challenges) if (challenge.expiresAt <= now) this.challenges.delete(id);
    for (const [id, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(id);
  }
}

export function pairingProofMessage(input: {
  pairingId: string;
  nonce: string;
  origin: string;
  instanceId: string;
  clientId: string;
}): string {
  return JSON.stringify([
    'gatewayctl-pairing-v2',
    input.pairingId,
    input.nonce,
    input.origin,
    input.instanceId,
    input.clientId,
  ]);
}

export function sessionProofMessage(input: {
  challengeId: string;
  nonce: string;
  origin: string;
  instanceId: string;
  clientId: string;
}): string {
  return JSON.stringify([
    'gatewayctl-session-v2',
    input.challengeId,
    input.nonce,
    input.origin,
    input.instanceId,
    input.clientId,
  ]);
}

function pairingMessage(pairing: PendingPairing, instanceId: string): string {
  return pairingProofMessage({
    pairingId: pairing.id,
    nonce: pairing.nonce,
    origin: pairing.origin,
    instanceId,
    clientId: pairing.clientId,
  });
}

function sessionMessage(challenge: SessionChallenge, instanceId: string): string {
  return sessionProofMessage({
    challengeId: challenge.id,
    nonce: challenge.nonce,
    origin: challenge.origin,
    instanceId,
    clientId: challenge.clientId,
  });
}

function verifyProof(publicJwk: JWK, message: string, encodedSignature: string): void {
  try {
    const signature = Buffer.from(encodedSignature, 'base64url');
    const valid = verify('sha256', Buffer.from(message), {
      key: createPublicKey({ key: publicJwk as NodeJsonWebKey, format: 'jwk' }),
      dsaEncoding: 'ieee-p1363',
    }, signature);
    if (!valid) throw new Error('signature mismatch');
  } catch {
    throw new GatewayCtlError('client_proof_invalid', 'Browser client signature is invalid');
  }
}

function validatePublicKey(jwk: JWK): void {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || 'd' in jwk) {
    throw new GatewayCtlError('invalid_client_key', 'Browser client key must be a public P-256 JWK');
  }
  try {
    createPublicKey({ key: jwk as NodeJsonWebKey, format: 'jwk' });
  } catch {
    throw new GatewayCtlError('invalid_client_key', 'Browser client public JWK is invalid');
  }
}

function pairingCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let value = BigInt(`0x${randomBytes(5).toString('hex')}`);
  let result = '';
  for (let index = 0; index < 8; index += 1) {
    result = alphabet[Number(value & 31n)] + result;
    value >>= 5n;
  }
  return result;
}

function normalizePairingCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/gu, '');
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}
