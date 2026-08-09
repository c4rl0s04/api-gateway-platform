import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { LabProductError, type LabProductOperations } from '../services/lab-products.js';

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  proxyIds: z.array(z.string().trim().min(1)).max(100).default([]),
  environmentIds: z.array(z.string().trim().min(1)).max(30).default([]),
  active: z.boolean().default(true),
}).strict();
const updateSchema = productSchema.partial().refine(
  value => Object.keys(value).length > 0,
  'At least one field is required',
);

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof LabProductError) {
    return reply.code(404).send({ error: error.code, message: error.message });
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  const code = (error as { code?: string })?.code;
  if (statusCode === 403 || statusCode === 404 || code?.endsWith('_not_found')) {
    return reply.code(404).send({ error: 'lab_resource_not_found', message: 'Lab resource does not exist' });
  }
  throw error;
}

export function registerLabProductRoutes(
  server: FastifyInstance,
  products: LabProductOperations,
): void {
  server.get('/lab/v1/environments', request => products.listEnvironments(request.labPrincipal));
  server.get('/lab/v1/products', request => products.list(request.labPrincipal));
  server.get<{ Params: { productId: string } }>('/lab/v1/products/:productId', async (request, reply) => {
    try { return await products.get(request.params.productId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Body: unknown }>('/lab/v1/products', async (request, reply) => {
    const parsed = productSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    try { return reply.code(201).send(await products.create(parsed.data, request.labPrincipal)); }
    catch (error) { return sendError(reply, error); }
  });
  server.patch<{ Params: { productId: string }; Body: unknown }>('/lab/v1/products/:productId', async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    try { return await products.update(request.params.productId, parsed.data, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
}
