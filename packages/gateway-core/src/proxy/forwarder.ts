import { request as undiciRequest } from 'undici';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProxyConfig, EndpointConfig } from '@api-gateway/shared';
import type { ResolvedEndpoint } from './resolver';

/**
 * Replaces variables in the target URL (e.g. "http://backend/users/:id" -> "http://backend/users/123")
 * and adds the original query parameters if they exist.
 */
function buildTargetUrl(requestUrl: string, resolved: ResolvedEndpoint): string {
  let url = resolved.endpoint.targetUrl;
  
  for (const [key, value] of Object.entries(resolved.params)) {
    url = url.replace(`:${key}`, value);
  }
  
  const queryIndex = requestUrl.indexOf('?');
  if (queryIndex !== -1) {
    url += requestUrl.slice(queryIndex);
  }
  
  return url;
}

/**
 * Determines if a request has a body that needs to be forwarded to the backend.
 * GET and HEAD never have a body according to the HTTP specification.
 */
function hasBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
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
  const targetUrl = buildTargetUrl(req.url, resolved);

  req.log.info(
    { targetUrl, proxyId: proxy.id, endpointId: resolved.endpoint.id, method: req.method },
    'Forwarding request to backend',
  );

  try {
    const upstream = await undiciRequest(targetUrl, {
      method: req.method as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'DELETE'
        | 'PATCH'
        | 'OPTIONS'
        | 'HEAD',

      headers: {
        // Pass the original client headers to the backend...
        ...req.headers,
        // ...but overwrite host so the backend receives its own host,
        // not the gateway's. Without this, some backends reject the request.
        host: new URL(resolved.endpoint.targetUrl).host,
        // Standard traceability headers: allow tracking the request
        // across multiple services in the logs.
        'x-forwarded-for': req.ip,
        'x-forwarded-host': req.hostname,
        'x-request-id': req.id as string,
        'x-correlation-id': req.id as string,
        // Custom gateway header: useful for the backend to know
        // which proxy processed the request (auditing, debugging).
        'x-proxy-id': proxy.id,
      },

      body: hasBody(req.method) && req.body
        ? JSON.stringify(req.body)
        : null,

      // Reasonable timeout: if the backend doesn't respond in 30s, we cut it.
      // In week 4 this will be configurable per proxy.
      bodyTimeout: 30_000,
      headersTimeout: 30_000,
    });

    // Pass the backend's status code to the client without modifying it
    reply.status(upstream.statusCode);

    // Pass the backend's content-type so the client knows
    // how to interpret the body (JSON, text, etc.)
    const contentType = upstream.headers['content-type'];
    if (contentType) {
      reply.header('content-type', contentType as string);
    }

    // Informational header: the client can see which proxy processed their request
    reply.header('x-gateway-proxy', proxy.id);

    const body = await upstream.body.text();
    reply.send(body);

  } catch (err) {
    // Connection error: the backend is not available.
    // We log the internal error with detail, but only tell the client 502.
    req.log.error(
      { err, targetUrl, proxyId: proxy.id },
      'Backend unreachable or returned an error',
    );

    reply.status(502).send({
      error: 'Bad Gateway',
      message: 'The upstream service is temporarily unavailable',
      requestId: req.id,
    });
  }
}
