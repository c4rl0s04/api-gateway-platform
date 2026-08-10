import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { BrowserAgentAuth, type PairingPrompt } from './browser-auth.js';
import type { AgentOperations } from './operations.js';
import { writeAgentState } from './runtime-state.js';
import { TrustedClientStore } from './trusted-client-store.js';
import {
  AGENT_CAPABILITIES,
  AGENT_PROTOCOL_VERSION,
  GatewayCtlError,
  type AgentOperationRequest,
  type AgentOperationResponse,
  type AgentProfile,
} from './types.js';

const MAX_BODY_BYTES = 256 * 1024;
export interface RunningAgent {
  port: number;
  instanceId: string;
  close(): Promise<void>;
}

export async function startLocalAgent(input: {
  operations: AgentOperations;
  profile: AgentProfile;
  stateDirectory: string;
  port?: number;
  onPairingPrompt?: (prompt: PairingPrompt) => void;
}): Promise<RunningAgent> {
  const instanceId = randomUUID();
  const trustedClients = new TrustedClientStore(input.stateDirectory, input.profile.trustedClientDays);
  const browserAuth = new BrowserAgentAuth(
    trustedClients,
    instanceId,
    input.onPairingPrompt ?? (() => undefined),
  );
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (request.method === 'OPTIONS') {
      if (!origin || !input.profile.allowedOrigins.includes(origin)) {
        sendJson(response, 403, { error: { code: 'origin_not_allowed', message: 'Browser origin is not allowed' } });
        return;
      }
      setCorsHeaders(response, origin);
      response.writeHead(204).end();
      return;
    }
    if (!origin || !input.profile.allowedOrigins.includes(origin)) {
      sendJson(response, 403, { error: { code: 'origin_not_allowed', message: 'Browser origin is not allowed' } });
      return;
    }
    setCorsHeaders(response, origin);
    try {
      if (request.method === 'GET' && request.url === '/v1/status') {
        sendJson(response, 200, {
          name: 'gatewayctl',
          protocolVersion: AGENT_PROTOCOL_VERSION,
          agentVersion: '1.0.0',
          instanceId,
          capabilities: AGENT_CAPABILITIES,
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/pairings') {
        const body = await readJsonBody(request);
        const pairing = await browserAuth.createPairing({
          clientId: stringField(body, 'clientId'),
          origin,
          label: stringField(body, 'label'),
          publicJwk: objectField(body, 'publicJwk'),
        });
        await recordAudit(input.stateDirectory, 'agent.pairing.request', { origin });
        sendJson(response, 202, pairing);
        return;
      }
      const pairingCompletion = request.method === 'POST'
        ? request.url?.match(/^\/v1\/pairings\/([^/]+)\/complete$/u)
        : null;
      if (pairingCompletion) {
        const body = await readJsonBody(request);
        const session = await browserAuth.completePairing({
          pairingId: decodeURIComponent(pairingCompletion[1]!),
          code: stringField(body, 'code'),
          signature: stringField(body, 'signature'),
        });
        await recordAudit(input.stateDirectory, 'agent.pairing.complete', { origin });
        sendJson(response, 200, session);
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/sessions/challenges') {
        const body = await readJsonBody(request);
        sendJson(response, 200, await browserAuth.createSessionChallenge({
          clientId: stringField(body, 'clientId'),
          origin,
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/sessions') {
        const body = await readJsonBody(request);
        const session = await browserAuth.completeSession({
          challengeId: stringField(body, 'challengeId'),
          signature: stringField(body, 'signature'),
        });
        await recordAudit(input.stateDirectory, 'agent.session.create', { origin });
        sendJson(response, 200, session);
        return;
      }
      if (request.method === 'POST' && request.url === '/v1/rpc') {
        await browserAuth.authorize(bearerToken(request), origin);
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
      sendJson(response, errorStatus(gatewayError.code), payload);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', error => {
      const code = (error as NodeJS.ErrnoException).code;
      reject(code === 'EADDRINUSE'
        ? new GatewayCtlError('agent_port_in_use', `Port ${input.port ?? input.profile.port} is already in use`)
        : error);
    });
    server.listen(input.port ?? input.profile.port, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new GatewayCtlError('agent_start_failed', 'Could not determine agent port');
  }
  await mkdir(input.stateDirectory, { recursive: true, mode: 0o700 });
  await writeAgentState(input.stateDirectory, {
    pid: process.pid,
    port: address.port,
    instanceId,
    protocolVersion: AGENT_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
  });
  return {
    port: address.port,
    instanceId,
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

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== 'string' || !value) {
    throw new GatewayCtlError('invalid_request', `${name} is required`);
  }
  return value;
}

function objectField(body: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = body[name];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayCtlError('invalid_request', `${name} is required`);
  }
  return value as Record<string, unknown>;
}

function errorStatus(code: string): number {
  if (code === 'session_invalid') return 401;
  if (code === 'origin_not_allowed') return 403;
  if (code === 'client_not_registered') return 404;
  if (code === 'pairing_pending' || code === 'client_already_registered') return 409;
  if (code === 'pairing_limit_reached') return 429;
  return 400;
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
