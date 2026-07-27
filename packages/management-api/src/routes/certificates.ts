import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CertificateOperations } from '../services/certificates.js';

const issueSchema = z.object({
  csrPem: z.string().includes('BEGIN CERTIFICATE REQUEST'),
  authorityId: z.string().uuid().optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
});
const externalSchema = z.object({
  authorityId: z.string().uuid(),
  certificatePem: z.string().includes('BEGIN CERTIFICATE'),
  chainPem: z.string().nullable().optional(),
});
const revokeSchema = z.object({
  reason: z.enum(['unspecified', 'keyCompromise', 'cessationOfOperation'])
    .default('unspecified'),
});

export function registerCertificateRoutes(
  server: FastifyInstance,
  certificates: CertificateOperations,
): void {
  server.get<{ Params: { organizationId: string } }>(
    '/v1/organizations/:organizationId/certificates',
    request => certificates.list(
      request.params.organizationId,
      request.adminPrincipal,
    ),
  );
  server.post<{ Params: { credentialId: string }; Body: unknown }>(
    '/v1/credentials/:credentialId/certificates/issue',
    async (request, reply) => {
      const body = issueSchema.parse(request.body);
      return reply.code(201).send(await certificates.issue({
        credentialId: request.params.credentialId,
        ...body,
      }, request.adminPrincipal));
    },
  );
  server.post<{ Params: { credentialId: string }; Body: unknown }>(
    '/v1/credentials/:credentialId/certificates/external',
    async (request, reply) => {
      const body = externalSchema.parse(request.body);
      return reply.code(201).send(await certificates.registerExternal({
        credentialId: request.params.credentialId,
        ...body,
      }, request.adminPrincipal));
    },
  );
  server.get<{ Params: { certificateId: string } }>(
    '/v1/certificates/:certificateId/download',
    request => certificates.download(
      request.params.certificateId,
      request.adminPrincipal,
    ),
  );
  server.post<{ Params: { certificateId: string }; Body: unknown }>(
    '/v1/certificates/:certificateId/revoke',
    request => certificates.revoke(
      request.params.certificateId,
      revokeSchema.parse(request.body).reason,
      request.adminPrincipal,
    ),
  );
  server.get(
    '/v1/pki/status',
    request => certificates.status(request.adminPrincipal),
  );
}
