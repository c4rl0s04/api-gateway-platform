import { LabWorkspaceError } from '@api-gateway/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { LabWorkspaceOperations } from '../services/lab-workspaces.js';

function sendLabError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof LabWorkspaceError)) throw error;
  const status = error.code === 'lab_resource_not_found'
    ? 404
    : error.code === 'lab_limit_reached' ? 429 : 410;
  return reply.code(status).send({ error: error.code, message: error.message });
}

export function registerLabWorkspaceRoutes(
  server: FastifyInstance,
  workspaces: LabWorkspaceOperations,
): void {
  server.post('/lab/v1/workspace', async (request, reply) => {
    try {
      const result = await workspaces.create(request.labPrincipal) as {
        created: boolean;
      };
      return reply.code(result.created ? 201 : 200).send(result);
    } catch (error) {
      return sendLabError(reply, error);
    }
  });
  server.get('/lab/v1/workspace', async (request, reply) => {
    try {
      return await workspaces.get(request.labPrincipal);
    } catch (error) {
      return sendLabError(reply, error);
    }
  });
  server.post('/lab/v1/workspace/reset', async (request, reply) => {
    try {
      return await workspaces.reset(request.labPrincipal);
    } catch (error) {
      return sendLabError(reply, error);
    }
  });
  server.post('/lab/v1/workspace/revoke', async (request, reply) => {
    try {
      return await workspaces.revoke(request.labPrincipal);
    } catch (error) {
      return sendLabError(reply, error);
    }
  });
}
