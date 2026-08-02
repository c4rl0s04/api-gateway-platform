import type { FastifyInstance } from 'fastify';
import type { ProductOperations } from '../services/products.js';

export function registerProductRoutes(
  server: FastifyInstance,
  products: ProductOperations,
): void {
  server.get<{ Params: { organizationId: string } }>(
    '/v1/organizations/:organizationId/products',
    request => products.list(
      request.params.organizationId,
      request.adminPrincipal,
    ),
  );
  server.get<{ Params: { productId: string } }>(
    '/v1/products/:productId',
    request => products.get(request.params.productId, request.adminPrincipal),
  );
}
