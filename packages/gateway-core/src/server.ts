import Fastify from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';
import { loadProxies, resolveProxy, getRegistrySize } from './proxy/resolver';
import { forwardRequest } from './proxy/forwarder';

/**
 * Proxies hardcodeados para semana 1.
 *
 * IMPORTANTE: En semana 2 esto se reemplazará por una carga desde Postgres.
 * La función loadProxies() y la interfaz de ProxyConfig no cambiarán,
 * solo el origen de los datos. Por eso los tenemos aquí aislados y claramente
 * marcados como seed temporal.
 *
 * basePath "/api/users" → backend en localhost:4000, ruta "/users"
 * basePath "/api/accounts" → backend en localhost:4000, ruta "/accounts"
 * (En desarrollo ambos apuntan al mismo json-server, en producción serían servicios distintos)
 */
const DEV_SEED_PROXIES: ProxyConfig[] = [
  {
    id: 'proxy-users-dev',
    name: 'Users API',
    basePath: '/api/users',
    targetUrl: 'http://localhost:4000/users',
    organizationId: 'org-bank-dev',
    environmentId: 'env-dev',
    policies: [],
    active: true,
  },
  {
    id: 'proxy-accounts-dev',
    name: 'Accounts API',
    basePath: '/api/accounts',
    targetUrl: 'http://localhost:4000/accounts',
    organizationId: 'org-bank-dev',
    environmentId: 'env-dev',
    policies: [],
    active: true,
  },
];

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
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // pino-pretty solo en desarrollo: formatea los logs en JSON para producción
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    // Cada request recibe un ID único para trazabilidad en logs
    genReqId: () => crypto.randomUUID(),
  });

  // Carga los proxies en memoria
  // En semana 1: desde el seed hardcodeado
  // En semana 2: desde Postgres (loadProxies recibirá los datos de la DB)
  loadProxies(DEV_SEED_PROXIES);
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
    const proxy = resolveProxy(req.url);

    if (!proxy) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `No proxy is configured for path: ${req.url}`,
        hint: 'Check that the proxy exists and is active in the gateway configuration',
      });
    }

    await forwardRequest(req, reply, proxy);
  });

  return server;
}
