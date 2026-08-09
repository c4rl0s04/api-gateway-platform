import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LabAuditOperations } from '../services/lab-audit.js';

const querySchema = z.object({
  action: z.string().trim().min(1).max(160).optional(),
  resourceType: z.string().trim().min(1).max(120).optional(),
  resourceId: z.string().trim().min(1).max(160).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

export function registerLabAuditRoutes(
  server: FastifyInstance,
  audit: LabAuditOperations,
): void {
  server.get<{ Querystring: unknown }>('/lab/v1/audit-events', request =>
    audit.list(querySchema.parse(request.query), request.labPrincipal));
}
