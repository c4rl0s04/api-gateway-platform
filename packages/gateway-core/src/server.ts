import crypto from 'node:crypto';
import Fastify from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';
import { loadProxies, resolveProxy, getRegistrySize, resolveEndpoint } from './proxy/resolver';
import { forwardRequest } from './proxy/forwarder';
import { loadProxiesFromDatabase } from './db/proxy-loader.js';

/**
 * Builds and configures the Fastify server.
 *
 * Returns the instance without starting it (without listen()) so that:
 * - In production: index.ts calls server.listen()
 * - In tests: server.inject() is used without opening a real port
 *
 * This separation is a good practice that makes the server completely testable.
 */
export async function buildServer() {
  const server = Fastify({
    disableRequestLogging: true, // Disable default logging (noisy)
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    // Read the Correlation ID from the client or generate a new one
    genReqId: (req) => {
      const existingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
      if (existingId && typeof existingId === 'string') return existingId;
      return crypto.randomUUID();
    },
  });

  // ─── Logging Hooks ─────────────────────────────────────────────────────────

  server.addHook('onRequest', (req, reply, done) => {
    req.log.info(
      {
        method: req.method,
        url: req.url,
        hostname: req.hostname,
        remoteAddress: req.ip,
      },
      'incoming request'
    );
    done();
  });

  server.addHook('onResponse', (req, reply, done) => {
    req.log.info(
      {
        proxyId: (req as any).proxyId,
        endpointId: (req as any).endpointId,
        targetUrl: (req as any).targetUrl,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'request completed'
    );
    done();
  });

  // Load active proxies from PostgreSQL on startup.
  // The in-memory registry is updated here; resolver.ts and forwarder.ts do not change.
  const dbProxies = await loadProxiesFromDatabase();
  loadProxies(dbProxies);
  server.log.info(
    { proxiesLoaded: getRegistrySize() },
    'Gateway proxy registry initialized',
  );

  // ─── Routes ────────────────────────────────────────────────────────────────

  /**
   * Gateway health check.
   * Responds 200 if the server is alive and the proxy registry is loaded.
   * Docker, Kubernetes, and load balancers use this endpoint to know if the
   * service is ready to receive traffic.
   */
  server.get('/health', async () => ({
    status: 'ok',
    proxiesLoaded: getRegistrySize(),
    timestamp: new Date().toISOString(),
  }));

  /**
   * Catch-all route: captures ALL requests that are not /health.
   * The `all` method accepts any HTTP verb (GET, POST, PUT, DELETE...).
   *
   * Request flow:
   * 1. Resolver: which proxy corresponds to this path?
   * 2. If no proxy → 404 with clear message
   * 3. If there is a proxy → Forwarder: forward to backend
   */
  server.all('/*', async (req, reply) => {
    // req.url contains query params. We need just the path for resolution.
    const pathWithoutQuery = req.url.split('?')[0];
    const proxy = resolveProxy(pathWithoutQuery);

    if (!proxy) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `No proxy is configured for path: ${pathWithoutQuery}`,
        hint: 'Check that the proxy exists and is active in the gateway configuration',
      });
    }

    const requestSuffix = pathWithoutQuery.slice(proxy.basePath.length);
    const resolved = resolveEndpoint(proxy, requestSuffix);

    if (!resolved) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Endpoint not found in proxy ${proxy.id} for path suffix: ${requestSuffix || '/'}`,
        hint: 'Check the explicit endpoints configured for this proxy',
      });
    }

    // Save context for logs
    (req as any).proxyId = proxy.id;
    (req as any).endpointId = resolved.endpoint.id;
    (req as any).targetUrl = resolved.endpoint.targetUrl;

    await forwardRequest(req, reply, proxy, resolved);
  });

  return server;
}
