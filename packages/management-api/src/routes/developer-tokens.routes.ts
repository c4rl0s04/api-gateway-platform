import type { FastifyInstance } from 'fastify';
import { developerTokenRequestSchema } from '@api-gateway/shared';
import type { DeveloperTokenOperations } from '../services/developer-tokens.js';

export function registerDeveloperTokenRoutes(
  server: FastifyInstance,
  developerTokens: DeveloperTokenOperations,
): void {
  server.post<{
    Params: { organizationId: string };
    Body: unknown;
  }>('/v1/organizations/:organizationId/developer-tokens', async (request, reply) => {
    const result = await developerTokens.issue(
      request.params.organizationId,
      developerTokenRequestSchema.parse(request.body),
      request.adminPrincipal,
    );
    return reply
      .header('cache-control', 'no-store')
      .header('pragma', 'no-cache')
      .code(201)
      .send(result);
  });
}
