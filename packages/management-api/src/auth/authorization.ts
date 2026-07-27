import type { AdminRole } from '@api-gateway/database';

export interface AdminMembershipRecord {
  id: string;
  role: AdminRole;
  organizationId: string | null;
  active: boolean;
}

export interface AdminPrincipal {
  issuer: string;
  subject: string;
  memberships: AdminMembershipRecord[];
}

export function isPlatformAdmin(principal: AdminPrincipal): boolean {
  return principal.memberships.some(membership =>
    membership.active && membership.role === 'platformAdmin');
}

export function canReadOrganization(
  principal: AdminPrincipal,
  organizationId: string,
): boolean {
  return isPlatformAdmin(principal) || principal.memberships.some(membership =>
    membership.active
    && membership.organizationId === organizationId
    && ['organizationAdmin', 'viewer'].includes(membership.role));
}

export function canManageOrganization(
  principal: AdminPrincipal,
  organizationId: string,
): boolean {
  return isPlatformAdmin(principal) || principal.memberships.some(membership =>
    membership.active
    && membership.organizationId === organizationId
    && membership.role === 'organizationAdmin');
}
