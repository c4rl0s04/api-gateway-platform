import type { FastifyInstance } from 'fastify';
import type { RuntimeSyncOperations } from '../services/runtime-sync.js';

export function registerRuntimeSyncRoutes(
  server: FastifyInstance,
  runtimeSync: RuntimeSyncOperations,
): void {
  server.get(
    '/v1/runtime-sync',
    request => runtimeSync.getStatus(request.adminPrincipal),
  );
}
