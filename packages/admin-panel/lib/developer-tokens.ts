import type { ManagementPrincipal } from '@/lib/api-client';

export function canIssueDeveloperToken(
  principal: ManagementPrincipal | null,
  organizationId: string | undefined,
): boolean {
  if (!principal || !organizationId) return false;
  return principal.memberships.some(membership =>
    membership.active && (
      membership.role === 'platformAdmin'
      || (membership.role === 'organizationAdmin'
        && membership.organizationId === organizationId)
    ));
}
