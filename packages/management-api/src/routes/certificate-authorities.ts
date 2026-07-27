import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  canReadOrganization,
  isPlatformAdmin,
} from '../auth/authorization.js';
import type { CertificateAuthorityOperations } from '../services/certificate-authorities.js';

const managedAuthoritySchema = z.object({
  name: z.string().trim().min(1).max(120),
  validityDays: z.number().int().min(365).max(3_650).optional(),
});

const externalAuthoritySchema = z.object({
  name: z.string().trim().min(1).max(120),
  certificatePem: z.string().includes('BEGIN CERTIFICATE'),
  chainPem: z.string().nullable().optional(),
  crlDistributionUrl: z.string().url().nullable().optional(),
});
const crlSchema = z.object({
  crlPem: z.string().includes('BEGIN X509 CRL'),
});

function requirePlatformAdmin(request: {
  adminPrincipal: Parameters<typeof isPlatformAdmin>[0];
}): void {
  if (!isPlatformAdmin(request.adminPrincipal)) {
    const error = new Error('Platform administrator role required');
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
}

export function registerCertificateAuthorityRoutes(
  server: FastifyInstance,
  authorities: CertificateAuthorityOperations,
): void {
  server.get<{ Params: { organizationId: string } }>(
    '/v1/organizations/:organizationId/certificate-authorities',
    async (request, reply) => {
      if (!canReadOrganization(
        request.adminPrincipal,
        request.params.organizationId,
      )) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      return authorities.list(request.params.organizationId);
    },
  );
  server.post<{
    Params: { organizationId: string };
    Body: unknown;
  }>(
    '/v1/organizations/:organizationId/certificate-authorities/managed',
    async (request, reply) => {
      requirePlatformAdmin(request);
      const body = managedAuthoritySchema.parse(request.body);
      const authority = await authorities.createManaged({
        organizationId: request.params.organizationId,
        ...body,
      }, request.adminPrincipal);
      return reply.code(201).send(authority);
    },
  );
  server.post<{
    Params: { organizationId: string };
    Body: unknown;
  }>(
    '/v1/organizations/:organizationId/certificate-authorities/external',
    async (request, reply) => {
      requirePlatformAdmin(request);
      const body = externalAuthoritySchema.parse(request.body);
      const authority = await authorities.importExternal({
        organizationId: request.params.organizationId,
        ...body,
      }, request.adminPrincipal);
      return reply.code(201).send(authority);
    },
  );
  for (const status of ['active', 'retiring', 'revoked'] as const) {
    server.post<{ Params: { authorityId: string } }>(
      `/v1/certificate-authorities/:authorityId/${status}`,
      async (request) => {
        requirePlatformAdmin(request);
        return authorities.setStatus(
          request.params.authorityId,
          status,
          request.adminPrincipal,
        );
      },
    );
  }
  server.post<{ Params: { authorityId: string } }>(
    '/v1/certificate-authorities/:authorityId/rotate',
    async (request) => {
      requirePlatformAdmin(request);
      return authorities.rotate(
        request.params.authorityId,
        request.adminPrincipal,
      );
    },
  );
  server.post<{ Params: { authorityId: string } }>(
    '/v1/certificate-authorities/:authorityId/refresh-crl',
    async (request) => {
      requirePlatformAdmin(request);
      return authorities.refreshCrl(
        request.params.authorityId,
        request.adminPrincipal,
      );
    },
  );
  server.post<{ Params: { authorityId: string }; Body: unknown }>(
    '/v1/certificate-authorities/:authorityId/crl',
    async (request) => {
      requirePlatformAdmin(request);
      return authorities.uploadCrl(
        request.params.authorityId,
        crlSchema.parse(request.body).crlPem,
        request.adminPrincipal,
      );
    },
  );
}
