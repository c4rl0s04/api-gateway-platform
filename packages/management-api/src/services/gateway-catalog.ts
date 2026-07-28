import { prisma } from '@api-gateway/database';
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
  basePath: true,
  active: true,
  systemManaged: true,
  organizationId: true,
  organization: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      endpoints: true,
      deployments: true,
      products: true,
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
    return prisma.apiProxy.findMany({
      where: organizationIds
        ? { organizationId: { in: organizationIds } }
        : {},
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: proxySummarySelection,
    });
  }

  async getProxy(proxyId: string, actor: AdminPrincipal) {
    const proxy = await prisma.apiProxy.findUnique({
      where: { id: proxyId },
      select: {
        ...proxySummarySelection,
        endpoints: {
          orderBy: [{ path: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            mode: true,
            path: true,
            targetPath: true,
            policies: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                type: true,
                order: true,
                enabled: true,
                config: true,
              },
            },
          },
        },
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
    if (!canReadOrganization(actor, proxy.organizationId)) {
      throw forbidden();
    }
    return proxy;
  }

  async listDeployments(proxyId: string, actor: AdminPrincipal) {
    const proxy = await prisma.apiProxy.findUnique({
      where: { id: proxyId },
      select: { organizationId: true },
    });
    if (!proxy) {
      throw notFound();
    }
    if (!canReadOrganization(actor, proxy.organizationId)) {
      throw forbidden();
    }
    return prisma.proxyDeployment.findMany({
      where: { proxyId },
      orderBy: [
        { environment: { stage: 'asc' } },
        { environment: { region: 'asc' } },
      ],
      select: {
        id: true,
        proxyId: true,
        environmentId: true,
        upstreamBaseUrl: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        environment: {
          select: {
            id: true,
            stage: true,
            region: true,
            publicOrigin: true,
          },
        },
      },
    });
  }
}
