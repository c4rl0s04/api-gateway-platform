import { AdminRole, prisma } from '@api-gateway/database';
import {
  canManageOrganization,
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';
import { ManagementError } from '../errors.js';

export interface ProductInput {
  name: string;
  scopes: string[];
  proxyIds: string[];
  environmentIds: string[];
  active: boolean;
}

export type UpdateProductInput = Partial<ProductInput>;

export interface ProductOperations {
  list(organizationId: string, actor: AdminPrincipal): Promise<unknown>;
  get(productId: string, actor: AdminPrincipal): Promise<unknown>;
  create(
    organizationId: string,
    input: ProductInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  update(
    productId: string,
    input: UpdateProductInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
}

const productSelection = {
  id: true,
  name: true,
  active: true,
  scopes: true,
  organizationId: true,
  createdAt: true,
  proxies: {
    orderBy: { name: 'asc' as const },
    select: { id: true, name: true, active: true },
  },
  environments: {
    orderBy: [{ stage: 'asc' as const }, { region: 'asc' as const }],
    select: { id: true, stage: true, region: true, publicOrigin: true },
  },
  _count: { select: { credentialGrants: true } },
};

function actorRole(actor: AdminPrincipal, organizationId: string): AdminRole {
  if (isPlatformAdmin(actor)) return AdminRole.platformAdmin;
  const membership = actor.memberships.find(candidate =>
    candidate.active
    && candidate.organizationId === organizationId
    && candidate.role === AdminRole.organizationAdmin);
  if (!membership) {
    throw new ManagementError(
      'forbidden',
      403,
      'Organization administration access denied',
    );
  }
  return membership.role;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function validateRelations(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string,
  proxyIds: string[] | undefined,
  environmentIds: string[] | undefined,
): Promise<void> {
  if (proxyIds) {
    const proxies = await transaction.apiProxy.findMany({
      where: { id: { in: proxyIds } },
      select: { id: true, organizationId: true },
    });
    if (proxies.length !== proxyIds.length) {
      throw new ManagementError(
        'proxy_not_found',
        404,
        'One or more API proxies do not exist',
      );
    }
    if (proxies.some(proxy => proxy.organizationId !== organizationId)) {
      throw new ManagementError(
        'organization_mismatch',
        409,
        'Every API proxy must belong to the product organization',
      );
    }
  }
  if (environmentIds) {
    const count = await transaction.environment.count({
      where: { id: { in: environmentIds } },
    });
    if (count !== environmentIds.length) {
      throw new ManagementError(
        'environment_not_found',
        404,
        'One or more environments do not exist',
      );
    }
  }
}

export class ProductService implements ProductOperations {
  async list(organizationId: string, actor: AdminPrincipal) {
    if (!canReadOrganization(actor, organizationId)) {
      throw new ManagementError('forbidden', 403, 'Organization access denied');
    }
    return prisma.apiProduct.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: productSelection,
    });
  }

  async get(productId: string, actor: AdminPrincipal) {
    const product = await prisma.apiProduct.findUnique({
      where: { id: productId },
      select: productSelection,
    });
    if (!product) {
      throw new ManagementError('product_not_found', 404, 'API product does not exist');
    }
    if (!canReadOrganization(actor, product.organizationId)) {
      throw new ManagementError('forbidden', 403, 'Organization access denied');
    }
    return product;
  }

  async create(
    organizationId: string,
    input: ProductInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw new ManagementError(
        'forbidden',
        403,
        'Organization administration access denied',
      );
    }
    const proxyIds = unique(input.proxyIds);
    const environmentIds = unique(input.environmentIds);
    const scopes = unique(input.scopes);
    return prisma.$transaction(async transaction => {
      const organization = await transaction.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) {
        throw new ManagementError(
          'organization_not_found',
          404,
          'Organization does not exist',
        );
      }
      await validateRelations(
        transaction,
        organizationId,
        proxyIds,
        environmentIds,
      );
      const product = await transaction.apiProduct.create({
        data: {
          name: input.name.trim(),
          active: input.active,
          scopes,
          organizationId,
          proxies: { connect: proxyIds.map(id => ({ id })) },
          environments: { connect: environmentIds.map(id => ({ id })) },
        },
        select: productSelection,
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: actorRole(actor, organizationId),
          organizationId,
          action: 'product.create',
          resourceType: 'ApiProduct',
          resourceId: product.id,
          metadata: { proxyIds, environmentIds, scopes },
        },
      });
      return product;
    });
  }

  async update(
    productId: string,
    input: UpdateProductInput,
    actor: AdminPrincipal,
  ) {
    return prisma.$transaction(async transaction => {
      const current = await transaction.apiProduct.findUnique({
        where: { id: productId },
        select: {
          id: true,
          organizationId: true,
          scopes: true,
          proxies: { select: { id: true } },
          environments: { select: { id: true } },
          credentialGrants: { select: { id: true, scopes: true } },
        },
      });
      if (!current) {
        throw new ManagementError('product_not_found', 404, 'API product does not exist');
      }
      if (!canManageOrganization(actor, current.organizationId)) {
        throw new ManagementError(
          'forbidden',
          403,
          'Organization administration access denied',
        );
      }
      const proxyIds = input.proxyIds ? unique(input.proxyIds) : undefined;
      const environmentIds = input.environmentIds
        ? unique(input.environmentIds)
        : undefined;
      const scopes = input.scopes ? unique(input.scopes) : undefined;
      await validateRelations(
        transaction,
        current.organizationId,
        proxyIds,
        environmentIds,
      );

      const trimmedGrantIds: string[] = [];
      if (scopes) {
        for (const grant of current.credentialGrants) {
          const nextScopes = grant.scopes.filter(scope => scopes.includes(scope));
          if (nextScopes.length !== grant.scopes.length) {
            await transaction.credentialProductGrant.update({
              where: { id: grant.id },
              data: { scopes: nextScopes },
            });
            trimmedGrantIds.push(grant.id);
          }
        }
      }

      const product = await transaction.apiProduct.update({
        where: { id: productId },
        data: {
          name: input.name?.trim(),
          active: input.active,
          scopes,
          proxies: proxyIds
            ? { set: proxyIds.map(id => ({ id })) }
            : undefined,
          environments: environmentIds
            ? { set: environmentIds.map(id => ({ id })) }
            : undefined,
        },
        select: productSelection,
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: actorRole(actor, current.organizationId),
          organizationId: current.organizationId,
          action: 'product.update',
          resourceType: 'ApiProduct',
          resourceId: productId,
          metadata: {
            changedFields: Object.keys(input),
            trimmedGrantIds,
          },
        },
      });
      return product;
    });
  }
}
