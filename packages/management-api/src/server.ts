import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { createAuthenticationHook, prismaMembershipStore, type MembershipStore } from './auth/middleware.js';
import { createOidcVerifier, type OidcVerifier } from './auth/oidc.js';
import { loadEnv, type ManagementEnv } from './config/env.js';
import { prisma } from './db/client.js';
import { registerApplicationRoutes } from './routes/apps.routes.js';
import { registerCertificateAuthorityRoutes } from './routes/certificate-authorities.js';
import type { ApplicationOperations } from './services/applications.js';
import type { CertificateAuthorityOperations } from './services/certificate-authorities.js';
import { registerCertificateRoutes } from './routes/certificates.js';
import type { CertificateOperations } from './services/certificates.js';
import { registerGatewayCatalogRoutes } from './routes/proxies.routes.js';
import type { GatewayCatalogOperations } from './services/gateway-catalog.js';
import { registerProxyRevisionRoutes } from './routes/proxy-revisions.routes.js';
import type { ProxyRevisionOperations } from './services/proxy-revisions.js';
import { serializeManagementError } from './errors.js';
import { registerOrganizationRoutes } from './routes/organizations.routes.js';
import type { OrganizationOperations } from './services/organizations.js';
import { registerProductRoutes } from './routes/products.routes.js';
import type { ProductOperations } from './services/products.js';
import { registerAuditRoutes } from './routes/audit.routes.js';
import type { AuditOperations } from './services/audit.js';
import { registerRuntimeSyncRoutes } from './routes/runtime-sync.routes.js';
import type { RuntimeSyncOperations } from './services/runtime-sync.js';

export interface ManagementServerOptions {
  config: ManagementEnv;
  logger?: boolean;
  verifier?: OidcVerifier;
  memberships?: MembershipStore;
  organizations?: OrganizationOperations;
  products?: ProductOperations;
  audit?: AuditOperations;
  applications?: ApplicationOperations;
  certificateAuthorities?: CertificateAuthorityOperations;
  certificates?: CertificateOperations;
  gatewayCatalog?: GatewayCatalogOperations;
  proxyRevisions?: ProxyRevisionOperations;
  runtimeSync?: RuntimeSyncOperations;
}

export function buildServer(options: ManagementServerOptions): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  server.setErrorHandler((error, request, reply) => {
    const serialized = serializeManagementError(error);
    if (serialized.statusCode === 500) {
      request.log.error({ err: error }, 'Management API request failed');
    }
    return reply.code(serialized.statusCode).send(serialized.body);
  });
  void server.register(multipart, {
    limits: { files: 2, fileSize: 5 * 1024 * 1024 },
  });
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
  if (options.organizations) {
    registerOrganizationRoutes(server, options.organizations);
  }
  if (options.products) {
    registerProductRoutes(server, options.products);
  }
  if (options.audit) {
    registerAuditRoutes(server, options.audit);
  }
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
  if (options.gatewayCatalog) {
    registerGatewayCatalogRoutes(server, options.gatewayCatalog);
  }
  if (options.proxyRevisions) {
    registerProxyRevisionRoutes(server, options.proxyRevisions);
  }
  if (options.runtimeSync) {
    registerRuntimeSyncRoutes(server, options.runtimeSync);
  }
  return server;
}

export { loadEnv };
