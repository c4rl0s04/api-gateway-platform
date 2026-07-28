import type { FastifyInstance } from 'fastify';
import type { GatewayCatalogOperations } from '../services/gateway-catalog.js';

export function registerGatewayCatalogRoutes(
  server: FastifyInstance,
  catalog: GatewayCatalogOperations,
): void {
  server.get(
    '/v1/environments',
    request => catalog.listEnvironments(request.adminPrincipal),
  );
  server.get(
    '/v1/proxies',
    request => catalog.listProxies(request.adminPrincipal),
  );
  server.get<{ Params: { proxyId: string } }>(
    '/v1/proxies/:proxyId',
    request => catalog.getProxy(
      request.params.proxyId,
      request.adminPrincipal,
    ),
  );
  server.get<{ Params: { proxyId: string } }>(
    '/v1/proxies/:proxyId/deployments',
    request => catalog.listDeployments(
      request.params.proxyId,
      request.adminPrincipal,
    ),
  );
}
