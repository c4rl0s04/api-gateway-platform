import { prisma } from '@api-gateway/database';
import {
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';
import { ManagementError } from '../errors.js';

export interface AuditQuery {
  organizationId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  cursor?: string;
  limit: number;
}

export interface AuditOperations {
  list(query: AuditQuery, actor: AdminPrincipal): Promise<unknown>;
}

export class AuditService implements AuditOperations {
  async list(query: AuditQuery, actor: AdminPrincipal) {
    if (query.organizationId
      && !canReadOrganization(actor, query.organizationId)) {
      throw new ManagementError('forbidden', 403, 'Organization access denied');
    }
    const visibleOrganizationIds = isPlatformAdmin(actor)
      ? undefined
      : [...new Set(actor.memberships
        .filter(membership => membership.active && membership.organizationId)
        .map(membership => membership.organizationId!))];
    const events = await prisma.auditEvent.findMany({
      where: {
        organizationId: query.organizationId
          ? query.organizationId
          : visibleOrganizationIds
            ? { in: visibleOrganizationIds }
            : undefined,
        action: query.action,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : undefined,
      take: query.limit + 1,
      select: {
        id: true,
        actorIssuer: true,
        actorSubject: true,
        actorRole: true,
        organizationId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        metadata: true,
        createdAt: true,
      },
    });
    const hasMore = events.length > query.limit;
    const items = hasMore ? events.slice(0, query.limit) : events;
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    };
  }
}
