import { lookup } from 'node:dns/promises';
import { Agent, request as undiciRequest, type Dispatcher } from 'undici';
import Fastify, { type FastifyInstance } from 'fastify';
import { prisma } from '@api-gateway/database';
import {
  buildPublicTarget,
  isPublicAddress,
  safeRequestHeaders,
  safeResponseHeaders,
  withoutRequestBodyHeaders,
} from './security.js';

const REQUEST_LIMIT = 256 * 1024;
const RESPONSE_LIMIT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const RATE_LIMIT = 120;

interface Counter { windowStartedAt: number; count: number }
const counters = new Map<string, Counter>();

function consumeQuota(workspaceId: string): boolean {
  const now = Date.now();
  const current = counters.get(workspaceId);
  if (!current || now - current.windowStartedAt >= 60_000) {
    counters.set(workspaceId, { windowStartedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

async function publicDispatcher(hostname: string): Promise<Agent> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(result => !isPublicAddress(result.address))) {
    throw Object.assign(new Error('Upstream DNS resolved to a blocked address'), {
      code: 'lab_upstream_blocked',
    });
  }
  const selected = addresses[0]!;
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, selected.address, selected.family);
      },
    },
  });
}

async function readLimitedBody(body: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > RESPONSE_LIMIT) {
      throw Object.assign(new Error('Upstream response exceeds one MiB'), {
        code: 'lab_upstream_response_too_large',
      });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function executePublicRequest(input: {
  target: URL;
  method: string;
  headers: Record<string, string | string[]>;
  body: Buffer | null;
}): Promise<{
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}> {
  let target = input.target;
  let method = input.method;
  let body = input.body;
  let headers = input.headers;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (target.protocol !== 'https:' || (target.port && target.port !== '443')) {
      throw Object.assign(new Error('Redirect target is not public HTTPS'), {
        code: 'lab_upstream_blocked',
      });
    }
    const dispatcher = await publicDispatcher(target.hostname);
    try {
      const response = await undiciRequest(target, {
        dispatcher,
        method: method as Dispatcher.HttpMethod,
        headers,
        body: method === 'GET' || method === 'HEAD' ? null : body,
        headersTimeout: REQUEST_TIMEOUT_MS,
        bodyTimeout: REQUEST_TIMEOUT_MS,
        maxRedirections: 0,
      });
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && location) {
        await response.body.dump();
        if (redirects === MAX_REDIRECTS) {
          throw Object.assign(new Error('Upstream redirect limit exceeded'), {
            code: 'lab_upstream_blocked',
          });
        }
        target = new URL(Array.isArray(location) ? location[0] : location, target);
        if (response.statusCode === 303
          || ((response.statusCode === 301 || response.statusCode === 302) && method === 'POST')) {
          method = 'GET';
          body = null;
          headers = withoutRequestBodyHeaders(headers);
        }
        continue;
      }
      return {
        statusCode: response.statusCode,
        headers: safeResponseHeaders(response.headers),
        body: await readLimitedBody(response.body),
      };
    } finally {
      await dispatcher.close();
    }
  }
  throw new Error('Unreachable redirect state');
}

function rawBody(value: unknown): Buffer | null {
  if (value === undefined || value === null) return null;
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
}

export function buildLabEgressServer(logger = true): FastifyInstance {
  const server = Fastify({ logger, bodyLimit: REQUEST_LIMIT });
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  server.get('/live', async () => ({ status: 'ok' }));
  server.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });
  server.all<{ Params: { upstreamId: string; '*': string } }>(
    '/upstreams/:upstreamId/*',
    async (request, reply) => {
      const upstream = await prisma.labUpstream.findFirst({
        where: {
          id: request.params.upstreamId,
          active: true,
          workspace: { status: 'active', expiresAt: { gt: new Date() } },
        },
        include: { workspace: { select: { id: true } } },
      });
      if (!upstream) {
        return reply.code(404).send({ error: 'lab_resource_not_found' });
      }
      if (!consumeQuota(upstream.workspace.id)) {
        return reply.code(429).send({ error: 'lab_rate_limit_exceeded' });
      }
      const requestPath = `/${request.params['*']}${new URL(request.url, 'http://local').search}`;
      if (upstream.kind === 'mock') {
        const config = upstream.mockConfig as {
          routes?: Array<{
            method: string;
            path: string;
            status: number;
            headers?: Record<string, string>;
            body?: unknown;
            latencyMs?: number;
          }>;
        };
        const route = config.routes?.find(candidate =>
          candidate.method === request.method && candidate.path === `/${request.params['*']}`);
        if (!route) return reply.code(404).send({ error: 'lab_mock_route_not_found' });
        if (route.latencyMs) await new Promise(resolve => setTimeout(resolve, route.latencyMs));
        for (const [name, value] of Object.entries(route.headers ?? {})) reply.header(name, value);
        return reply.code(route.status).send(route.body ?? null);
      }
      if (!upstream.targetUrl) {
        return reply.code(502).send({ error: 'lab_upstream_invalid' });
      }
      try {
        const response = await executePublicRequest({
          target: buildPublicTarget(upstream.targetUrl, requestPath),
          method: request.method,
          headers: safeRequestHeaders(request.headers),
          body: rawBody(request.body),
        });
        for (const [name, value] of Object.entries(response.headers)) reply.header(name, value);
        return reply.code(response.statusCode).send(response.body);
      } catch (error) {
        request.log.warn({ err: error, upstreamId: upstream.id }, 'Lab upstream request rejected');
        const code = (error as { code?: string }).code;
        return reply.code(code === 'lab_upstream_blocked' ? 400 : 502).send({
          error: code ?? 'lab_upstream_unavailable',
        });
      }
    },
  );
  return server;
}
