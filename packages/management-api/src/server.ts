import Fastify, { type FastifyInstance } from 'fastify';
import { createAuthenticationHook, prismaMembershipStore, type MembershipStore } from './auth/middleware.js';
import { canReadOrganization, isPlatformAdmin } from './auth/authorization.js';
import { createOidcVerifier, type OidcVerifier } from './auth/oidc.js';
import { loadEnv, type ManagementEnv } from './config/env.js';
import { prisma } from './db/client.js';
import { registerApplicationRoutes } from './routes/apps.routes.js';
import { registerCertificateAuthorityRoutes } from './routes/certificate-authorities.js';
import type { ApplicationOperations } from './services/applications.js';
import type { CertificateAuthorityOperations } from './services/certificate-authorities.js';
import { registerCertificateRoutes } from './routes/certificates.js';
import type { CertificateOperations } from './services/certificates.js';

export interface ManagementServerOptions {
  config: ManagementEnv;
  logger?: boolean;
  verifier?: OidcVerifier;
  memberships?: MembershipStore;
  applications?: ApplicationOperations;
  certificateAuthorities?: CertificateAuthorityOperations;
  certificates?: CertificateOperations;
}

export function buildServer(options: ManagementServerOptions): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const verifier = options.verifier ?? createOidcVerifier({
    issuer: options.config.OIDC_ISSUER,
    audience: options.config.OIDC_AUDIENCE,
    jwksUri: options.config.OIDC_JWKS_URI,
  });
  server.addHook(
    'preHandler',
    async (request, reply) => {
      if (!request.url.startsWith('/v1')) return;
      await createAuthenticationHook(
        verifier,
        options.memberships ?? prismaMembershipStore,
      )(request, reply);
    },
  );

  server.get('/live', async () => ({ status: 'ok' }));
  server.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });
  server.get('/v1/me', async request => ({
    issuer: request.adminPrincipal.issuer,
    subject: request.adminPrincipal.subject,
    memberships: request.adminPrincipal.memberships,
  }));
  server.get('/v1/organizations', async request => {
    const where = isPlatformAdmin(request.adminPrincipal)
      ? {}
      : {
          id: {
            in: request.adminPrincipal.memberships
              .map(membership => membership.organizationId)
              .filter((value): value is string => Boolean(value)),
          },
        };
    return prisma.organization.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  });
  server.get<{ Params: { organizationId: string } }>(
    '/v1/organizations/:organizationId',
    async (request, reply) => {
      if (!canReadOrganization(
        request.adminPrincipal,
        request.params.organizationId,
      )) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'Organization access denied',
        });
      }
      const organization = await prisma.organization.findUnique({
        where: { id: request.params.organizationId },
        select: { id: true, name: true },
      });
      if (!organization) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return organization;
    },
  );
  if (options.applications) {
    registerApplicationRoutes(server, options.applications);
  }
  if (options.certificateAuthorities) {
    registerCertificateAuthorityRoutes(
      server,
      options.certificateAuthorities,
    );
  }
  if (options.certificates) {
    registerCertificateRoutes(server, options.certificates);
  }
  return server;
}

export { loadEnv };
