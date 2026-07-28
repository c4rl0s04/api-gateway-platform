import {
  RegisterDeveloperApplicationError,
} from '@api-gateway/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ApplicationOperations } from '../services/applications.js';

const registerApplicationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  products: z.array(z.object({
    productId: z.string().trim().min(1).max(120),
    scopes: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })).min(1).max(100),
}).strict();

function sendRegistrationError(
  reply: FastifyReply,
  error: RegisterDeveloperApplicationError,
) {
  const statusCode = [
    'organization_not_found',
    'product_not_found',
  ].includes(error.code)
    ? 404
    : error.code === 'product_not_active'
      ? 409
      : 400;
  return reply.code(statusCode).send({
    error: error.code,
    message: error.message,
  });
}

export function registerApplicationRoutes(
  server: FastifyInstance,
  applications: ApplicationOperations,
): void {
  server.get<{ Params: { organizationId: string } }>(
    '/v1/organizations/:organizationId/apps',
    request => applications.list(
      request.params.organizationId,
      request.adminPrincipal,
    ),
  );

  server.get<{ Params: { appId: string } }>(
    '/v1/apps/:appId',
    request => applications.get(
      request.params.appId,
      request.adminPrincipal,
    ),
  );

  server.post<{
    Params: { organizationId: string };
    Body: unknown;
  }>(
    '/v1/organizations/:organizationId/apps',
    async (request, reply) => {
      const parsed = registerApplicationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Application registration request is invalid',
          details: parsed.error.flatten(),
        });
      }
      try {
        const result = await applications.register(
          request.params.organizationId,
          parsed.data,
          request.adminPrincipal,
        );
        return reply.code(201).send(result);
      } catch (error) {
        if (error instanceof RegisterDeveloperApplicationError) {
          return sendRegistrationError(reply, error);
        }
        throw error;
      }
    },
  );
}
