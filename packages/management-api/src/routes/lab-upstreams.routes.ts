import { LabUpstreamError } from '@api-gateway/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { LabUpstreamOperations } from '../services/lab-upstreams.js';

const mockRouteSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z.string().trim().startsWith('/').max(500),
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string().max(4_096)).optional(),
  body: z.unknown().optional(),
  latencyMs: z.number().int().min(0).max(5_000).optional(),
}).strict();
const mockSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.literal('mock'),
  routes: z.array(mockRouteSchema).min(1).max(100),
  active: z.boolean().optional(),
}).strict();
const publicSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.literal('publicHttps'),
  targetUrl: z.string().trim().min(1).max(2_048),
  active: z.boolean().optional(),
}).strict();
const createSchema = z.discriminatedUnion('kind', [mockSchema, publicSchema]);
const updateSchema = z.union([
  mockSchema.partial().extend({ kind: z.literal('mock').optional() }).strict(),
  publicSchema.partial().extend({ kind: z.literal('publicHttps').optional() }).strict(),
]).refine(value => Object.keys(value).length > 0, 'At least one field is required');

function sendError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof LabUpstreamError)) throw error;
  const status = error.code === 'lab_resource_not_found'
    ? 404
    : error.code === 'lab_upstream_conflict' ? 409 : 400;
  return reply.code(status).send({ error: error.code, message: error.message });
}

export function registerLabUpstreamRoutes(
  server: FastifyInstance,
  upstreams: LabUpstreamOperations,
): void {
  server.get('/lab/v1/upstreams', request => upstreams.list(request.labPrincipal));
  server.post<{ Body: unknown }>('/lab/v1/upstreams', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Lab upstream request is invalid',
        details: parsed.error.flatten(),
      });
    }
    try {
      return reply.code(201).send(await upstreams.create(parsed.data, request.labPrincipal));
    } catch (error) {
      return sendError(reply, error);
    }
  });
  server.patch<{ Params: { upstreamId: string }; Body: unknown }>(
    '/lab/v1/upstreams/:upstreamId',
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request', message: 'Lab upstream update is invalid' });
      }
      try {
        return await upstreams.update(
          request.params.upstreamId,
          parsed.data,
          request.labPrincipal,
        );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );
}
