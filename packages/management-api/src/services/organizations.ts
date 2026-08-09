import { AdminRole, OrganizationKind, prisma } from '@api-gateway/database';
import { isPlatformAdmin, type AdminPrincipal } from '../auth/authorization.js';
import { ManagementError } from '../errors.js';

export interface CreateOrganizationInput {
  name: string;
}

export interface UpdateOrganizationInput {
  name: string;
}

export interface OrganizationOperations {
  list(actor: AdminPrincipal): Promise<unknown>;
  get(organizationId: string, actor: AdminPrincipal): Promise<unknown>;
  create(input: CreateOrganizationInput, actor: AdminPrincipal): Promise<unknown>;
  update(
    organizationId: string,
    input: UpdateOrganizationInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
}

function requirePlatformAdmin(actor: AdminPrincipal): void {
  if (!isPlatformAdmin(actor)) {
    throw new ManagementError(
      'forbidden',
      403,
      'Platform administrator role required',
    );
  }
}

export class OrganizationService implements OrganizationOperations {
  async list(actor: AdminPrincipal) {
    const organizationIds = isPlatformAdmin(actor)
      ? undefined
      : actor.memberships
        .filter(membership => membership.active && membership.organizationId)
        .map(membership => membership.organizationId!);
    return prisma.organization.findMany({
      where: {
        kind: OrganizationKind.standard,
        id: organizationIds ? { in: organizationIds } : undefined,
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true },
    });
  }

  async get(organizationId: string, actor: AdminPrincipal) {
    const canRead = isPlatformAdmin(actor) || actor.memberships.some(membership =>
      membership.active && membership.organizationId === organizationId);
    if (!canRead) {
      throw new ManagementError('forbidden', 403, 'Organization access denied');
    }
    const organization = await prisma.organization.findFirst({
      where: { id: organizationId, kind: OrganizationKind.standard },
      select: { id: true, name: true, createdAt: true },
    });
    if (!organization) {
      throw new ManagementError(
        'organization_not_found',
        404,
        'Organization does not exist',
      );
    }
    return organization;
  }

  async create(input: CreateOrganizationInput, actor: AdminPrincipal) {
    requirePlatformAdmin(actor);
    return prisma.$transaction(async transaction => {
      const organization = await transaction.organization.create({
        data: { name: input.name.trim() },
        select: { id: true, name: true, createdAt: true },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: AdminRole.platformAdmin,
          organizationId: organization.id,
          action: 'organization.create',
          resourceType: 'Organization',
          resourceId: organization.id,
          metadata: { name: organization.name },
        },
      });
      return organization;
    });
  }

  async update(
    organizationId: string,
    input: UpdateOrganizationInput,
    actor: AdminPrincipal,
  ) {
    requirePlatformAdmin(actor);
    return prisma.$transaction(async transaction => {
      const current = await transaction.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, kind: true },
      });
      if (!current || current.kind !== OrganizationKind.standard) {
        throw new ManagementError(
          'organization_not_found',
          404,
          'Organization does not exist',
        );
      }
      const organization = await transaction.organization.update({
        where: { id: organizationId },
        data: { name: input.name.trim() },
        select: { id: true, name: true, createdAt: true },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: AdminRole.platformAdmin,
          organizationId,
          action: 'organization.update',
          resourceType: 'Organization',
          resourceId: organizationId,
          metadata: { previousName: current.name, name: organization.name },
        },
      });
      return organization;
    });
  }
}
