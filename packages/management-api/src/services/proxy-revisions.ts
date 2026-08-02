import {
  AdminRole,
  createApiProxy,
  deployProxyRevision,
  getProxyRevision,
  getProxyRevisionSource,
  importProxyRevision,
  listProxyRevisions,
  prisma,
  updateApiProxy,
} from '@api-gateway/database';
import {
  canManageOrganization,
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';

export interface CreateProxyInput {
  name: string;
}

export interface ImportRevisionInput {
  openapiSource: string;
  gatewayConfigSource: string;
}

export interface UpdateProxyInput {
  name?: string;
  active?: boolean;
}

export interface DeployRevisionInput {
  environmentId: string;
  upstreamBaseUrl?: string | null;
}

export interface ProxyRevisionOperations {
  createProxy(
    organizationId: string,
    input: CreateProxyInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  updateProxy(
    proxyId: string,
    input: UpdateProxyInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  importRevision(
    proxyId: string,
    input: ImportRevisionInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  listRevisions(proxyId: string, actor: AdminPrincipal): Promise<unknown>;
  getRevision(
    proxyId: string,
    revisionNumber: number,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  getRevisionSource(
    proxyId: string,
    revisionNumber: number,
    source: 'openapi' | 'gateway',
    actor: AdminPrincipal,
  ): Promise<string>;
  deployRevision(
    proxyId: string,
    revisionNumber: number,
    input: DeployRevisionInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function actorRole(actor: AdminPrincipal, organizationId: string): AdminRole {
  if (isPlatformAdmin(actor)) return AdminRole.platformAdmin;
  const membership = actor.memberships.find(candidate =>
    candidate.active
    && candidate.organizationId === organizationId
    && candidate.role === AdminRole.organizationAdmin);
  if (!membership) throw forbidden('Organization administration access denied');
  return membership.role;
}

async function proxyOrganization(proxyId: string): Promise<string> {
  const proxy = await prisma.apiProxy.findUnique({
    where: { id: proxyId },
    select: { organizationId: true },
  });
  if (!proxy) throw notFound('Proxy does not exist');
  return proxy.organizationId;
}

export class ProxyRevisionService implements ProxyRevisionOperations {
  async createProxy(
    organizationId: string,
    input: CreateProxyInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return createApiProxy({
      organizationId,
      name: input.name,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async updateProxy(
    proxyId: string,
    input: UpdateProxyInput,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return updateApiProxy({
      proxyId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async importRevision(
    proxyId: string,
    input: ImportRevisionInput,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return importProxyRevision({
      proxyId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async listRevisions(proxyId: string, actor: AdminPrincipal) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    return listProxyRevisions(proxyId);
  }

  async getRevision(
    proxyId: string,
    revisionNumber: number,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    const revision = await getProxyRevision(proxyId, revisionNumber);
    if (!revision) throw notFound('Proxy revision does not exist');
    return revision;
  }

  async getRevisionSource(
    proxyId: string,
    revisionNumber: number,
    source: 'openapi' | 'gateway',
    actor: AdminPrincipal,
  ): Promise<string> {
    const organizationId = await proxyOrganization(proxyId);
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    const revision = await getProxyRevisionSource(proxyId, revisionNumber, source);
    if (!revision) throw notFound('Proxy revision does not exist');
    return source === 'openapi'
      ? (revision as { openapiSource: string }).openapiSource
      : (revision as { gatewayConfigSource: string }).gatewayConfigSource;
  }

  async deployRevision(
    proxyId: string,
    revisionNumber: number,
    input: DeployRevisionInput,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return deployProxyRevision({
      proxyId,
      revisionNumber,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }
}
