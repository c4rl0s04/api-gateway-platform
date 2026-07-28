import {
  AdminRole,
  prisma,
  registerDeveloperApplication,
} from '@api-gateway/database';
import {
  canManageOrganization,
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';

export interface RegisterApplicationInput {
  name: string;
  products: Array<{
    productId: string;
    scopes?: string[];
  }>;
}

export interface ApplicationOperations {
  list(organizationId: string, actor: AdminPrincipal): Promise<unknown>;
  get(appId: string, actor: AdminPrincipal): Promise<unknown>;
  register(
    organizationId: string,
    input: RegisterApplicationInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function actorRole(
  principal: AdminPrincipal,
  organizationId: string,
): AdminRole {
  if (isPlatformAdmin(principal)) {
    return AdminRole.platformAdmin;
  }
  const membership = principal.memberships.find(candidate =>
    candidate.active
    && candidate.organizationId === organizationId
    && candidate.role === AdminRole.organizationAdmin);
  if (!membership) {
    throw forbidden('Organization administration access denied');
  }
  return membership.role;
}

const appSelection = {
  id: true,
  name: true,
  status: true,
  organizationId: true,
  createdAt: true,
  credentials: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      consumerKey: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      createdAt: true,
      productGrants: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          status: true,
          scopes: true,
          product: {
            select: {
              id: true,
              name: true,
              active: true,
            },
          },
        },
      },
      publicKeys: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          kid: true,
          algorithm: true,
          status: true,
          validFrom: true,
          expiresAt: true,
        },
      },
      certificates: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          fingerprintSha256: true,
          status: true,
          validFrom: true,
          expiresAt: true,
        },
      },
    },
  },
};

export class ApplicationService implements ApplicationOperations {
  async list(organizationId: string, actor: AdminPrincipal) {
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    return prisma.developerApp.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: appSelection,
    });
  }

  async get(appId: string, actor: AdminPrincipal) {
    const app = await prisma.developerApp.findUnique({
      where: { id: appId },
      select: appSelection,
    });
    if (!app) {
      throw Object.assign(new Error('Application does not exist'), {
        statusCode: 404,
      });
    }
    if (!canReadOrganization(actor, app.organizationId)) {
      throw forbidden('Organization access denied');
    }
    return app;
  }

  async register(
    organizationId: string,
    input: RegisterApplicationInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return registerDeveloperApplication({
      organizationId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }
}
