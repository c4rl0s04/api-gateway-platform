import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { OrganizationOperations } from '../services/organizations.js';

const organizationBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
}).strict();

export function registerOrganizationRoutes(
  server: FastifyInstance,
  organizations: OrganizationOperations,
): void {
  server.get(
    '/v1/organizations',
    request => organizations.list(request.adminPrincipal),
  );
  server.get<{ Params: { organizationId: string } }>(
    '/v1/organizations/:organizationId',
    request => organizations.get(
      request.params.organizationId,
      request.adminPrincipal,
    ),
  );
  server.post<{ Body: unknown }>('/v1/organizations', async (request, reply) => {
    const organization = await organizations.create(
      organizationBodySchema.parse(request.body),
      request.adminPrincipal,
    );
    return reply.code(201).send(organization);
  });
  server.patch<{
    Params: { organizationId: string };
    Body: unknown;
  }>('/v1/organizations/:organizationId', async request =>
    organizations.update(
      request.params.organizationId,
      organizationBodySchema.parse(request.body),
      request.adminPrincipal,
    ));
}
