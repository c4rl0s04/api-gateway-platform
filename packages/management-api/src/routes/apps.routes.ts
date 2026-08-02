import {
  ApplicationManagementError,
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
const updateApplicationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['pending', 'approved', 'revoked']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'At least one application field is required',
});
const credentialProductsSchema = z.array(z.object({
  productId: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
}).strict()).min(1).max(100).refine(
  products => new Set(products.map(product => product.productId)).size
    === products.length,
  { message: 'Product IDs must be unique' },
);
const createCredentialSchema = z.object({
  expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value))
    .nullable().optional(),
  products: credentialProductsSchema,
}).strict();
const updateCredentialSchema = z.object({
  expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value))
    .nullable().optional(),
  status: z.enum(['pending', 'approved', 'revoked']).optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'At least one credential field is required',
});

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

function sendApplicationError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof ApplicationManagementError)) throw error;
  const statusCode = error.code.endsWith('_not_found')
    ? 404
    : error.code === 'invalid_status_transition' ? 409 : 400;
  return reply.code(statusCode).send({ error: error.code, message: error.message });
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

  server.patch<{ Params: { appId: string }; Body: unknown }>(
    '/v1/apps/:appId',
    async (request, reply) => {
      try {
        return await applications.update(
          request.params.appId,
          updateApplicationSchema.parse(request.body),
          request.adminPrincipal,
        );
      } catch (error) {
        return sendApplicationError(reply, error);
      }
    },
  );

  server.post<{ Params: { appId: string }; Body: unknown }>(
    '/v1/apps/:appId/credentials',
    async (request, reply) => {
      try {
        const result = await applications.createCredential(
          request.params.appId,
          createCredentialSchema.parse(request.body),
          request.adminPrincipal,
        );
        return reply.code(201).send(result);
      } catch (error) {
        return sendApplicationError(reply, error);
      }
    },
  );

  server.get<{ Params: { credentialId: string } }>(
    '/v1/credentials/:credentialId',
    request => applications.getCredential(
      request.params.credentialId,
      request.adminPrincipal,
    ),
  );
  server.patch<{ Params: { credentialId: string }; Body: unknown }>(
    '/v1/credentials/:credentialId',
    async (request, reply) => {
      try {
        return await applications.updateCredential(
          request.params.credentialId,
          updateCredentialSchema.parse(request.body),
          request.adminPrincipal,
        );
      } catch (error) {
        return sendApplicationError(reply, error);
      }
    },
  );
  server.post<{ Params: { credentialId: string } }>(
    '/v1/credentials/:credentialId/rotate-secret',
    async (request, reply) => {
      try {
        return await applications.rotateCredential(
          request.params.credentialId,
          request.adminPrincipal,
        );
      } catch (error) {
        return sendApplicationError(reply, error);
      }
    },
  );
}
