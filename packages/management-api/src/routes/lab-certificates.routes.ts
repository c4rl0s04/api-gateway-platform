import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { LabCertificateOperations } from '../services/lab-certificates.js';

const issueSchema = z.object({
  csrPem: z.string().includes('BEGIN CERTIFICATE REQUEST').max(64 * 1024),
  validityDays: z.number().int().min(1).max(1).optional(),
}).strict();
const revokeSchema = z.object({
  reason: z.enum(['unspecified', 'keyCompromise', 'cessationOfOperation']).default('unspecified'),
}).strict();

function sendError(reply: FastifyReply, error: unknown) {
  const statusCode = (error as { statusCode?: number })?.statusCode;
  const name = (error as { name?: string })?.name;
  if (statusCode === 403 || statusCode === 404 || name === 'NotFoundError') {
    return reply.code(404).send({ error: 'lab_resource_not_found', message: 'Lab resource does not exist' });
  }
  throw error;
}

export function registerLabCertificateRoutes(
  server: FastifyInstance,
  certificates: LabCertificateOperations,
): void {
  server.get('/lab/v1/certificates', request => certificates.list(request.labPrincipal));
  server.post<{ Params: { credentialId: string }; Body: unknown }>(
    '/lab/v1/credentials/:credentialId/certificates',
    async (request, reply) => {
      const parsed = issueSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
      try {
        return reply.code(201).send(await certificates.issue(
          request.params.credentialId,
          parsed.data,
          request.labPrincipal,
        ));
      } catch (error) { return sendError(reply, error); }
    },
  );
  server.get<{ Params: { certificateId: string } }>(
    '/lab/v1/certificates/:certificateId/download',
    async (request, reply) => {
      try { return await certificates.download(request.params.certificateId, request.labPrincipal); }
      catch (error) { return sendError(reply, error); }
    },
  );
  server.post<{ Params: { certificateId: string }; Body: unknown }>(
    '/lab/v1/certificates/:certificateId/revoke',
    async (request, reply) => {
      const parsed = revokeSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
      try {
        return await certificates.revoke(
          request.params.certificateId,
          parsed.data.reason,
          request.labPrincipal,
        );
      } catch (error) { return sendError(reply, error); }
    },
  );
}
