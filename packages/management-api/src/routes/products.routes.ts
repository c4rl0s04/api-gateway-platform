import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ProductOperations } from '../services/products.js';

const uniqueStrings = (minimum = 0) =>
  z.array(z.string().trim().min(1).max(120)).min(minimum).max(100)
    .refine(values => new Set(values).size === values.length, {
      message: 'Values must be unique',
    });
const productFields = {
  name: z.string().trim().min(1).max(120),
  scopes: uniqueStrings(),
  proxyIds: uniqueStrings(1),
  environmentIds: uniqueStrings(),
  active: z.boolean(),
};
const createProductSchema = z.object({
  name: productFields.name,
  scopes: productFields.scopes.default([]),
  proxyIds: productFields.proxyIds,
  environmentIds: productFields.environmentIds.default([]),
  active: productFields.active.default(true),
}).strict();
const updateProductSchema = z.object({
  name: productFields.name.optional(),
  scopes: productFields.scopes.optional(),
  proxyIds: productFields.proxyIds.optional(),
  environmentIds: productFields.environmentIds.optional(),
  active: productFields.active.optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'At least one product field is required',
});

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
  server.post<{
    Params: { organizationId: string };
    Body: unknown;
  }>('/v1/organizations/:organizationId/products', async (request, reply) => {
    const product = await products.create(
      request.params.organizationId,
      createProductSchema.parse(request.body),
      request.adminPrincipal,
    );
    return reply.code(201).send(product);
  });
  server.patch<{
    Params: { productId: string };
    Body: unknown;
  }>('/v1/products/:productId', request => products.update(
    request.params.productId,
    updateProductSchema.parse(request.body),
    request.adminPrincipal,
  ));
}
