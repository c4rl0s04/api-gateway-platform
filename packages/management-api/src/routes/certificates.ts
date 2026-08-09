import type { FastifyInstance, FastifyRequest } from 'fastify';
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

const MAX_CERTIFICATE_FILE_SIZE = 1024 * 1024;

function toPem(buffer: Buffer, label: 'CERTIFICATE'): string {
  const text = buffer.toString('utf8').trim();
  if (text.includes(`BEGIN ${label}`)) return `${text}\n`;
  const encoded = buffer.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${encoded}\n-----END ${label}-----\n`;
}

async function readExternalCertificateUpload(request: FastifyRequest) {
  const files = new Map<string, Buffer>();
  let authorityId: string | undefined;
  for await (const part of request.parts({
    limits: { files: 2, fields: 1, fileSize: MAX_CERTIFICATE_FILE_SIZE },
  })) {
    if (part.type === 'field') {
      if (part.fieldname !== 'authorityId' || authorityId !== undefined) {
        throw Object.assign(new Error(`Unexpected multipart field ${part.fieldname}`), {
          statusCode: 400,
        });
      }
      authorityId = String(part.value);
      continue;
    }
    if (!['certificate', 'chain'].includes(part.fieldname) || files.has(part.fieldname)) {
      throw Object.assign(new Error(`Unexpected multipart file ${part.fieldname}`), {
        statusCode: 400,
      });
    }
    files.set(part.fieldname, await part.toBuffer());
  }
  const certificate = files.get('certificate');
  if (!authorityId || !certificate) {
    throw Object.assign(new Error('authorityId and certificate are required'), {
      statusCode: 400,
    });
  }
  return externalSchema.parse({
    authorityId,
    certificatePem: toPem(certificate, 'CERTIFICATE'),
    chainPem: files.has('chain') ? toPem(files.get('chain')!, 'CERTIFICATE') : null,
  });
}

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
  server.get<{ Params: { credentialId: string } }>(
    '/v1/credentials/:credentialId/certificates',
    request => certificates.listCredential(
      request.params.credentialId,
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
      const body = request.isMultipart()
        ? await readExternalCertificateUpload(request)
        : externalSchema.parse(request.body);
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
