import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuditOperations } from '../services/audit.js';

const auditQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).max(160).optional(),
  resourceType: z.string().trim().min(1).max(120).optional(),
  resourceId: z.string().trim().min(1).max(160).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

export function registerAuditRoutes(
  server: FastifyInstance,
  audit: AuditOperations,
): void {
  server.get<{ Querystring: unknown }>('/v1/audit-events', request =>
    audit.list(
      auditQuerySchema.parse(request.query),
      request.adminPrincipal,
    ));
}
