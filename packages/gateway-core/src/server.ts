import Fastify from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';
import { loadProxies, resolveProxy, getRegistrySize, resolveEndpoint } from './proxy/resolver';
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
    id: 'proxy-es-banking',
    name: 'ES Banking',
    basePath: '/es/banking/v1',
    endpoints: [
      { id: 'ep-health', path: '/health', targetUrl: 'http://localhost:4000/health', policies: [] },
      { id: 'ep-accounts', path: '/accounts', targetUrl: 'http://localhost:4000/accounts', policies: [] },
      { id: 'ep-account-id', path: '/accounts/:id', targetUrl: 'http://localhost:4000/accounts/:id', policies: [] }
    ],
    organizationId: 'org-bank-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-us-banking',
    name: 'US Banking',
    basePath: '/us/banking/v2',
    endpoints: [
      { id: 'ep-ping', path: '/ping', targetUrl: 'http://localhost:4000/ping', policies: [] },
      { id: 'ep-cards', path: '/cards', targetUrl: 'http://localhost:4000/cards', policies: [] },
      { id: 'ep-card-id', path: '/cards/:id', targetUrl: 'http://localhost:4000/cards/:id', policies: [] }
    ],
    organizationId: 'org-bank-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-uk-logistics',
    name: 'UK Logistics',
    basePath: '/uk/logistics/v1',
    endpoints: [
      { id: 'ep-health', path: '/health', targetUrl: 'http://localhost:4000/health', policies: [] },
      { id: 'ep-shipments', path: '/shipments', targetUrl: 'http://localhost:4000/shipments', policies: [] },
      { id: 'ep-shipments-id', path: '/shipments/:id', targetUrl: 'http://localhost:4000/shipments/:id', policies: [] }
    ],
    organizationId: 'org-log-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-fr-ecommerce',
    name: 'FR E-commerce',
    basePath: '/fr/ecommerce/v1',
    endpoints: [
      { id: 'ep-ping', path: '/ping', targetUrl: 'http://localhost:4000/ping', policies: [] },
      { id: 'ep-products', path: '/products', targetUrl: 'http://localhost:4000/products', policies: [] },
      { id: 'ep-products-id', path: '/products/:id', targetUrl: 'http://localhost:4000/products/:id', policies: [] }
    ],
    organizationId: 'org-ecom-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-es-ecommerce',
    name: 'ES E-commerce',
    basePath: '/es/ecommerce/v2',
    endpoints: [
      { id: 'ep-health', path: '/health', targetUrl: 'http://localhost:4000/health', policies: [] },
      { id: 'ep-orders', path: '/orders', targetUrl: 'http://localhost:4000/orders', policies: [] },
      { id: 'ep-orders-id', path: '/orders/:id', targetUrl: 'http://localhost:4000/orders/:id', policies: [] }
    ],
    organizationId: 'org-ecom-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-de-healthcare',
    name: 'DE Healthcare',
    basePath: '/de/healthcare/v1',
    endpoints: [
      { id: 'ep-ping', path: '/ping', targetUrl: 'http://localhost:4000/ping', policies: [] },
      { id: 'ep-patients', path: '/patients', targetUrl: 'http://localhost:4000/patients', policies: [] },
      { id: 'ep-patients-id', path: '/patients/:id', targetUrl: 'http://localhost:4000/patients/:id', policies: [] }
    ],
    organizationId: 'org-health-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-us-identity',
    name: 'US Identity',
    basePath: '/us/identity/v1',
    endpoints: [
      { id: 'ep-health', path: '/health', targetUrl: 'http://localhost:4000/health', policies: [] },
      { id: 'ep-users', path: '/users', targetUrl: 'http://localhost:4000/users', policies: [] },
      { id: 'ep-users-id', path: '/users/:id', targetUrl: 'http://localhost:4000/users/:id', policies: [] }
    ],
    organizationId: 'org-id-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-jp-iot',
    name: 'JP IoT',
    basePath: '/jp/iot/v1',
    endpoints: [
      { id: 'ep-ping', path: '/ping', targetUrl: 'http://localhost:4000/ping', policies: [] },
      { id: 'ep-devices', path: '/devices', targetUrl: 'http://localhost:4000/devices', policies: [] },
      { id: 'ep-devices-id', path: '/devices/:id', targetUrl: 'http://localhost:4000/devices/:id', policies: [] }
    ],
    organizationId: 'org-iot-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-br-streaming',
    name: 'BR Streaming',
    basePath: '/br/streaming/v1',
    endpoints: [
      { id: 'ep-health', path: '/health', targetUrl: 'http://localhost:4000/health', policies: [] },
      { id: 'ep-catalog', path: '/catalog', targetUrl: 'http://localhost:4000/catalog', policies: [] },
      { id: 'ep-catalog-id', path: '/catalog/:id', targetUrl: 'http://localhost:4000/catalog/:id', policies: [] }
    ],
    organizationId: 'org-stream-dev', environmentId: 'env-dev', active: true
  },
  {
    id: 'proxy-kr-gaming',
    name: 'KR Gaming',
    basePath: '/kr/gaming/v1',
    endpoints: [
      { id: 'ep-ping', path: '/ping', targetUrl: 'http://localhost:4000/ping', policies: [] },
      { id: 'ep-leaderboards', path: '/leaderboards', targetUrl: 'http://localhost:4000/leaderboards', policies: [] },
      { id: 'ep-leaderboards-id', path: '/leaderboards/:id', targetUrl: 'http://localhost:4000/leaderboards/:id', policies: [] }
    ],
    organizationId: 'org-game-dev', environmentId: 'env-dev', active: true
  }
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

    await forwardRequest(req, reply, proxy, resolved);
  });

  return server;
}
