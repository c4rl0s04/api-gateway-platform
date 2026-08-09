import { OrganizationKind, listProxyDeployments, prisma } from '@api-gateway/database';
import {
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';

export interface GatewayCatalogOperations {
  listEnvironments(actor: AdminPrincipal): Promise<unknown>;
  listProxies(actor: AdminPrincipal): Promise<unknown>;
  getProxy(proxyId: string, actor: AdminPrincipal): Promise<unknown>;
  listDeployments(proxyId: string, actor: AdminPrincipal): Promise<unknown>;
}

function forbidden(): Error {
  return Object.assign(new Error('Organization access denied'), {
    statusCode: 403,
  });
}

function notFound(): Error {
  return Object.assign(new Error('Proxy does not exist'), {
    statusCode: 404,
  });
}

export function readableOrganizationIds(
  actor: AdminPrincipal,
): string[] | undefined {
  if (isPlatformAdmin(actor)) {
    return undefined;
  }
  return [...new Set(actor.memberships
    .filter(membership => membership.active && membership.organizationId)
    .map(membership => membership.organizationId!))];
}

const proxySummarySelection = {
  id: true,
  name: true,
  active: true,
  systemManaged: true,
  organizationId: true,
  organization: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      revisions: true,
      deployments: true,
      products: true,
    },
  },
  revisions: {
    orderBy: { revisionNumber: 'desc' as const },
    take: 1,
    select: {
      id: true,
      revisionNumber: true,
      basePath: true,
      openapiVersion: true,
      contentHash: true,
      createdAt: true,
    },
  },
  deployments: {
    where: { status: 'active' as const },
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      environmentId: true,
      revisionId: true,
      status: true,
    },
  },
};

export class GatewayCatalogService implements GatewayCatalogOperations {
  listEnvironments(_actor: AdminPrincipal) {
    return prisma.environment.findMany({
      orderBy: [{ stage: 'asc' }, { region: 'asc' }],
      select: {
        id: true,
        stage: true,
        region: true,
        publicOrigin: true,
        createdAt: true,
        _count: {
          select: {
            deployments: true,
            products: true,
          },
        },
      },
    });
  }

  listProxies(actor: AdminPrincipal) {
    const organizationIds = readableOrganizationIds(actor);
    const organizationKind = actor.context === 'lab'
      ? OrganizationKind.lab
      : OrganizationKind.standard;
    return prisma.apiProxy.findMany({
      where: {
        organization: { kind: organizationKind },
        organizationId: organizationIds ? { in: organizationIds } : undefined,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: proxySummarySelection,
    });
  }

  async getProxy(proxyId: string, actor: AdminPrincipal) {
    const proxy = await prisma.apiProxy.findUnique({
      where: { id: proxyId },
      select: {
        ...proxySummarySelection,
        organization: { select: { id: true, name: true, kind: true } },
        products: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            active: true,
            scopes: true,
          },
        },
      },
    });
    if (!proxy) {
      throw notFound();
    }
    const expectedKind = actor.context === 'lab'
      ? OrganizationKind.lab
      : OrganizationKind.standard;
    if (proxy.organization.kind !== expectedKind) throw notFound();
    if (!canReadOrganization(actor, proxy.organizationId)) {
      throw forbidden();
    }
    return proxy;
  }

  async listDeployments(proxyId: string, actor: AdminPrincipal) {
    const proxy = await prisma.apiProxy.findUnique({
      where: { id: proxyId },
      select: {
        organizationId: true,
        organization: { select: { kind: true } },
      },
    });
    if (!proxy) {
      throw notFound();
    }
    const expectedKind = actor.context === 'lab'
      ? OrganizationKind.lab
      : OrganizationKind.standard;
    if (proxy.organization.kind !== expectedKind) throw notFound();
    if (!canReadOrganization(actor, proxy.organizationId)) {
      throw forbidden();
    }
    return listProxyDeployments(proxyId);
  }
}
