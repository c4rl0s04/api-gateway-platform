import crypto from 'node:crypto';
import Fastify from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';
import {
  loadProxies,
  resolveProxy,
  getRegistrySize,
  getRegistryEnvironmentCount,
  isRegistryReady,
  resolveEndpoint,
} from './proxy/resolver';
import { forwardRequest } from './proxy/forwarder';
import { loadProxiesFromDatabase } from './db/proxy-loader.js';
import { registerBuiltinPolicies } from './policies/registry';
import { executePipeline } from './policies/pipeline';
import type { PolicyContext } from './policies/types';
import { configureRedisConnection } from './redis/client';
import { loadEnv, type GatewayEnv } from './config/env';
import { configureOAuthRuntime, getOAuthRuntime } from './oauth/runtime.js';

export interface BuildServerOptions {
  config?: GatewayEnv;
  /**
   * Supplying proxies skips PostgreSQL. This is intended for deterministic
   * tests and future config providers.
   */
  proxies?: ProxyConfig[];
  logger?: boolean;
}

function validateProxyConfiguration(proxies: ProxyConfig[]): void {
  for (const proxy of proxies) {
    for (const endpoint of proxy.endpoints) {
      const types = endpoint.policies
        .filter(policy => policy.enabled)
        .map(policy => policy.type);
      const authenticationTypes = types.filter(type =>
        ['api-key-auth', 'oauth-access-token', 'mtls-auth'].includes(type));
      if (authenticationTypes.length > 1) {
        throw new Error(`Endpoint "${endpoint.id}" configures more than one authentication policy`);
      }
      if (endpoint.mode === 'local' && !types.some(type =>
        type === 'oauth-token' || type === 'jwks-endpoint')) {
        throw new Error(`Local endpoint "${endpoint.id}" has no terminal response policy`);
      }
      if (endpoint.mode === 'forward' && (!endpoint.targetPath || !proxy.upstreamBaseUrl)) {
        throw new Error(`Forward endpoint "${endpoint.id}" requires targetPath and upstreamBaseUrl`);
      }
      if ((types.includes('oauth-token') || types.includes('jwks-endpoint'))
        && endpoint.mode !== 'local') {
        throw new Error(`Terminal OAuth policy on "${endpoint.id}" requires local mode`);
      }
    }
  }
}

/**
 * Builds and configures the Fastify server.
 *
 * Returns the instance without starting it (without listen()) so that:
 * - In production: index.ts calls server.listen()
 * - In tests: server.inject() is used without opening a real port
 *
 * This separation is a good practice that makes the server completely testable.
 */
export async function buildServer(options: BuildServerOptions = {}) {
  const config = options.config ?? loadEnv();
  const server = Fastify({
    disableRequestLogging: true, // Disable default logging (noisy)
    logger: options.logger === false
      ? false
      : {
          level: config.LOG_LEVEL,
          transport:
            config.NODE_ENV !== 'production'
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

  // A gateway must preserve request bytes. Policies can opt into parsing later,
  // but forwarding never assumes that the payload is JSON.
  server.removeAllContentTypeParsers();
  server.addContentTypeParser(
    '*',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  );

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
  const proxies = options.proxies ?? await loadProxiesFromDatabase(
    config.GATEWAY_ENVIRONMENT_ID
      ? [config.GATEWAY_ENVIRONMENT_ID]
      : undefined,
  );
  validateProxyConfiguration(proxies);
  await configureOAuthRuntime(config);
  const requiresSecurityRuntime = proxies.some(proxy =>
    proxy.endpoints.some(endpoint =>
      endpoint.policies.some(policy =>
        ['oauth-token', 'oauth-access-token', 'jwks-endpoint', 'mtls-auth']
          .includes(policy.type))));
  if (requiresSecurityRuntime) {
    getOAuthRuntime();
  }
  loadProxies(proxies);
  server.log.info(
    { proxiesLoaded: getRegistrySize() },
    'Gateway proxy registry initialized',
  );
  configureRedisConnection(config.REDIS_URL);
  registerBuiltinPolicies();
  server.log.info('Policy pipeline initialized with built-in policies');

  // ─── Routes ────────────────────────────────────────────────────────────────

  server.get('/live', async () => ({
    status: 'alive',
    timestamp: new Date().toISOString(),
  }));

  server.get('/ready', async (_request, reply) => {
    const ready = isRegistryReady();
    return reply.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not-ready',
      proxiesLoaded: getRegistrySize(),
      environmentsLoaded: getRegistryEnvironmentCount(),
      environmentId: config.GATEWAY_ENVIRONMENT_ID ?? null,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Catch-all route: captures requests that are not gateway operational routes.
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
    const proxy = resolveProxy(
      config.GATEWAY_ENVIRONMENT_ID ?? '',
      pathWithoutQuery,
    );

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

    // Save context for the onResponse logging hook
    (req as any).proxyId = proxy.id;
    (req as any).endpointId = resolved.endpoint.id;
    (req as any).targetPath = resolved.endpoint.targetPath;

    // Build the policy context and execute the pipeline
    const ctx: PolicyContext = {
      req,
      reply,
      proxy,
      endpoint: resolved.endpoint,
      params:   resolved.params,
      state:    {},
    };

    const pipelineResult = await executePipeline(resolved.endpoint.policies, ctx);

    // If any policy halted the chain, respond immediately without hitting the backend
    if (pipelineResult.action === 'halt') {
      return reply.status(pipelineResult.statusCode).send(pipelineResult.body);
    }
    if (pipelineResult.action === 'respond') {
      for (const [name, value] of Object.entries(pipelineResult.headers)) {
        reply.header(name, value);
      }
      return reply.status(pipelineResult.statusCode).send(pipelineResult.body);
    }
    if (resolved.endpoint.mode === 'local') {
      req.log.error({ endpointId: resolved.endpoint.id }, 'Local endpoint did not produce a response');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Local endpoint is not configured with a terminal policy',
        requestId: req.id,
      });
    }

    await forwardRequest(req, reply, proxy, resolved);
  });

  server.addHook('onClose', async () => {
    const { closeRedisConnection } = await import('./redis/client.js');
    await closeRedisConnection();
  });

  return server;
}
