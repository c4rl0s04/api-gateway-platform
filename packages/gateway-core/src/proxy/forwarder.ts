import { request as undiciRequest, type Dispatcher } from 'undici';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';
import type { ResolvedEndpoint } from './resolver';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Replaces variables in the target URL (e.g. "http://backend/users/:id" -> "http://backend/users/123")
 * and adds the original query parameters if they exist.
 */
export function buildTargetUrl(
  requestUrl: string,
  proxy: ProxyConfig,
  resolved: ResolvedEndpoint,
): string {
  let targetPath = resolved.endpoint.targetPath;
  if (!targetPath || !proxy.upstreamBaseUrl) {
    throw new Error('Forwarding requires targetPath and upstreamBaseUrl');
  }

  for (const [key, value] of Object.entries(resolved.params)) {
    targetPath = targetPath.replace(`{${key}}`, value);
    targetPath = targetPath.replace(`:${key}`, value);
  }

  const target = new URL(proxy.upstreamBaseUrl);
  target.pathname = [
    target.pathname.replace(/\/+$/, ''),
    targetPath.replace(/^\/+/, ''),
  ].filter(Boolean).join('/');
  if (!target.pathname.startsWith('/')) {
    target.pathname = `/${target.pathname}`;
  }

  const incoming = new URL(requestUrl, 'http://gateway.local');
  for (const [key, value] of incoming.searchParams) {
    target.searchParams.append(key, value);
  }

  return target.toString();
}

/**
 * Determines if a request has a body that needs to be forwarded to the backend.
 * GET and HEAD never have a body according to the HTTP specification.
 */
export function hasBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

function connectionSpecificHeaders(
  headers: FastifyRequest['headers'],
): Set<string> {
  const result = new Set(HOP_BY_HOP_HEADERS);
  const connection = headers.connection;
  if (typeof connection === 'string') {
    for (const name of connection.split(',')) {
      result.add(name.trim().toLowerCase());
    }
  }
  return result;
}

export function buildUpstreamHeaders(
  req: FastifyRequest,
  targetUrl: string,
  proxyId: string,
): Record<string, string | string[]> {
  const excluded = connectionSpecificHeaders(req.headers);
  excluded.add('host');
  excluded.add('content-length');

  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (!excluded.has(name.toLowerCase()) && value !== undefined) {
      headers[name] = value;
    }
  }

  const previousForwardedFor = req.headers['x-forwarded-for'];
  const forwardedFor = Array.isArray(previousForwardedFor)
    ? previousForwardedFor.join(', ')
    : previousForwardedFor;

  headers.host = new URL(targetUrl).host;
  headers['x-forwarded-for'] = forwardedFor
    ? `${forwardedFor}, ${req.ip}`
    : req.ip;
  headers['x-forwarded-host'] = req.hostname;
  headers['x-forwarded-proto'] = req.protocol;
  headers['x-request-id'] = String(req.id);
  headers['x-correlation-id'] = String(req.id);
  headers['x-proxy-id'] = proxyId;

  return headers;
}

export function getUpstreamBody(
  method: string,
  body: unknown,
): Buffer | string | Uint8Array | null {
  if (!hasBody(method) || body === undefined || body === null) {
    return null;
  }
  if (Buffer.isBuffer(body) || typeof body === 'string' || body instanceof Uint8Array) {
    return body;
  }

  // Kept for direct programmatic usage. Normal gateway traffic is parsed as a
  // Buffer in server.ts and therefore remains byte-for-byte unchanged.
  return JSON.stringify(body);
}

function copyUpstreamHeaders(
  reply: FastifyReply,
  headers: Record<string, string | string[] | undefined>,
): void {
  for (const [name, value] of Object.entries(headers)) {
    if (
      value !== undefined
      && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())
      && name.toLowerCase() !== 'content-length'
    ) {
      reply.header(name, value);
    }
  }
}

/**
 * Forwards a Fastify request to the backend configured in the proxy.
 * Writes the backend response directly to the Fastify reply.
 *
 * In case of a connection error to the backend, responds 502 Bad Gateway
 * without exposing internal details to the client.
 */
export async function forwardRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  proxy: ProxyConfig,
  resolved: ResolvedEndpoint
): Promise<void> {
  const targetUrl = buildTargetUrl(req.url, proxy, resolved);
  (req as any).targetUrl = targetUrl;

  req.log.info(
    { targetUrl, proxyId: proxy.id, endpointId: resolved.endpoint.id, method: req.method },
    'Forwarding request to backend',
  );

  try {
    const upstream = await undiciRequest(targetUrl, {
      method: req.method as Dispatcher.HttpMethod,
      headers: buildUpstreamHeaders(req, targetUrl, proxy.id),
      body: getUpstreamBody(req.method, req.body),

      // Reasonable timeout: if the backend doesn't respond in 30s, we cut it.
      // In week 4 this will be configurable per proxy.
      bodyTimeout: 30_000,
      headersTimeout: 30_000,
    });

    reply.status(upstream.statusCode);
    copyUpstreamHeaders(reply, upstream.headers);
    reply.header('x-gateway-proxy', proxy.id);
    await reply.send(upstream.body);

  } catch (err) {
    // Connection error: the backend is not available.
    // We log the internal error with detail, but only tell the client 502.
    req.log.error(
      { err, targetUrl, proxyId: proxy.id },
      'Backend unreachable or returned an error',
    );

    if (!reply.sent) {
      reply.status(502).send({
        error: 'Bad Gateway',
        message: 'The upstream service is temporarily unavailable',
        requestId: req.id,
      });
    }
  }
}
