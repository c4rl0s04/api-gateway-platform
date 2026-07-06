import crypto from 'node:crypto';
import Fastify from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';
import { loadProxies, resolveProxy, getRegistrySize, resolveEndpoint } from './proxy/resolver';
import { forwardRequest } from './proxy/forwarder';
import { loadProxiesFromDatabase } from './db/proxy-loader.js';

/**
 * Construye y configura el servidor Fastify.
 *
 * Devuelve la instancia sin haberla iniciado (sin listen()) para que:
 * - En producción: index.ts llame a server.listen()
 * - En tests: se use server.inject() sin abrir un puerto real
 *
 * Esta separación es una buena práctica que hace el servidor completamente testeable.
 */
export async function buildServer() {
  const server = Fastify({
    disableRequestLogging: true, // Desactivamos el log por defecto (ruidoso)
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    // Leemos el Correlation ID del cliente o generamos uno nuevo
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

  // Carga los proxies activos desde PostgreSQL al arrancar.
  // El registry en memoria se actualiza aquí; resolver.ts y forwarder.ts no cambian.
  const dbProxies = await loadProxiesFromDatabase();
  loadProxies(dbProxies);
  server.log.info(
    { proxiesLoaded: getRegistrySize() },
    'Gateway proxy registry initialized',
  );

  // ─── Rutas ────────────────────────────────────────────────────────────────

  /**
   * Health check del gateway.
   * Responde 200 si el servidor está vivo y el registro de proxies está cargado.
   * Docker, Kubernetes y load balancers usan este endpoint para saber si el
   * servicio está listo para recibir tráfico.
   */
  server.get('/health', async () => ({
    status: 'ok',
    proxiesLoaded: getRegistrySize(),
    timestamp: new Date().toISOString(),
  }));

  /**
   * Ruta catch-all: captura TODAS las requests que no sean /health.
   * El método `all` acepta cualquier verbo HTTP (GET, POST, PUT, DELETE...).
   *
   * Flujo de cada request:
   * 1. Resolver: ¿qué proxy corresponde a este path?
   * 2. Si no hay proxy → 404 con mensaje claro
   * 3. Si hay proxy → Forwarder: reenviar al backend
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

    // Guardamos contexto para los logs
    (req as any).proxyId = proxy.id;
    (req as any).endpointId = resolved.endpoint.id;
    (req as any).targetUrl = resolved.endpoint.targetUrl;

    await forwardRequest(req, reply, proxy, resolved);
  });

  return server;
}
