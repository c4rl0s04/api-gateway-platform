import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { AgentOperations } from './operations.js';
import {
  GatewayCtlError,
  type AgentOperationRequest,
  type AgentOperationResponse,
  type AgentProfile,
} from './types.js';

const MAX_BODY_BYTES = 256 * 1024;
const SESSION_TTL_MS = 30 * 60 * 1000;

interface AgentSession {
  tokenHash: string;
  origin: string;
  expiresAt: number;
}

export interface RunningAgent {
  port: number;
  pairingNonce: string;
  close(): Promise<void>;
}

export async function startLocalAgent(input: {
  operations: AgentOperations;
  profile: AgentProfile;
  stateDirectory: string;
  port?: number;
}): Promise<RunningAgent> {
  let pairingNonce = randomBytes(32).toString('base64url');
  let session: AgentSession | undefined;
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (request.method === 'OPTIONS') {
      if (!origin || !input.profile.allowedOrigins.includes(origin)) {
        sendJson(response, 403, { error: 'origin_not_allowed' });
        return;
      }
      setCorsHeaders(response, origin);
      response.writeHead(204).end();
      return;
    }
    if (!origin || !input.profile.allowedOrigins.includes(origin)) {
      sendJson(response, 403, { error: 'origin_not_allowed' });
      return;
    }
    setCorsHeaders(response, origin);
    try {
      if (request.method === 'POST' && request.url === '/pair') {
        const body = await readJsonBody(request);
        if (typeof body.nonce !== 'string'
          || pairingNonce === ''
          || !timingSafeTextEqual(body.nonce, pairingNonce)) {
          throw new GatewayCtlError('pairing_rejected', 'Pairing code is invalid or already used');
        }
        const token = randomBytes(32).toString('base64url');
        session = {
          tokenHash: hashToken(token),
          origin,
          expiresAt: Date.now() + SESSION_TTL_MS,
        };
        pairingNonce = '';
        await recordAudit(input.stateDirectory, 'agent.pair', { origin });
        sendJson(response, 200, {
          token,
          expiresAt: new Date(session.expiresAt).toISOString(),
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/rpc') {
        authorizeSession(request, origin, session);
        session!.expiresAt = Date.now() + SESSION_TTL_MS;
        const body = await readJsonBody(request) as unknown as AgentOperationRequest;
        if (!body || typeof body.method !== 'string') {
          throw new GatewayCtlError('invalid_request', 'RPC method is required');
        }
        const startedAt = Date.now();
        const result = await input.operations.execute(body.method, body.params ?? {});
        await recordAudit(input.stateDirectory, body.method, {
          durationMs: Date.now() - startedAt,
          status: 'success',
        });
        const payload: AgentOperationResponse = { id: body.id, result };
        sendJson(response, 200, payload);
        return;
      }
      sendJson(response, 404, { error: 'route_not_found' });
    } catch (error) {
      const gatewayError = error instanceof GatewayCtlError
        ? error
        : new GatewayCtlError('agent_error', 'Local agent operation failed');
      await recordAudit(input.stateDirectory, 'agent.error', {
        code: gatewayError.code,
      });
      const payload: AgentOperationResponse = {
        error: { code: gatewayError.code, message: gatewayError.message },
      };
      sendJson(response, gatewayError.code === 'session_invalid' ? 401 : 400, payload);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(input.port ?? 0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new GatewayCtlError('agent_start_failed', 'Could not determine agent port');
  }
  await mkdir(input.stateDirectory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(input.stateDirectory, 'agent.json'), JSON.stringify({
    pid: process.pid,
    port: address.port,
    startedAt: new Date().toISOString(),
  }), { mode: 0o600 });
  return {
    port: address.port,
    pairingNonce,
    close: () => new Promise<void>((resolve, reject) => server.close(error => {
      if (error) reject(error);
      else resolve();
    })),
  };
}

function setCorsHeaders(response: ServerResponse, origin: string): void {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  response.setHeader('Access-Control-Allow-Private-Network', 'true');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Vary', 'Origin');
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new GatewayCtlError('request_too_large', 'Agent request exceeds 256 KiB');
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new GatewayCtlError('invalid_json', 'Agent request body must be valid JSON');
  }
}

function authorizeSession(
  request: IncomingMessage,
  origin: string,
  session?: AgentSession,
): void {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (!session
    || session.origin !== origin
    || session.expiresAt <= Date.now()
    || !timingSafeTextEqual(hashToken(token), session.tokenHash)) {
    throw new GatewayCtlError('session_invalid', 'Agent session is missing or expired');
  }
}

function timingSafeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.byteLength === rightBuffer.byteLength
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function recordAudit(
  stateDirectory: string,
  operation: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await appendFile(path.join(stateDirectory, 'agent-audit.ndjson'), `${JSON.stringify({
    timestamp: new Date().toISOString(),
    operation,
    ...metadata,
  })}\n`, { mode: 0o600 });
}
