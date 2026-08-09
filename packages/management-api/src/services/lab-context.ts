import {
  AdminRole,
  getPersonalLabWorkspace,
  type LabPrincipal,
} from '@api-gateway/database';
import type { AdminPrincipal } from '../auth/authorization.js';

export interface LabRequestContext {
  workspace: Awaited<ReturnType<typeof getPersonalLabWorkspace>>;
  actor: AdminPrincipal;
}

export async function resolveLabRequestContext(
  principal: LabPrincipal,
): Promise<LabRequestContext> {
  const workspace = await getPersonalLabWorkspace(principal);
  return {
    workspace,
    actor: {
      issuer: principal.issuer,
      subject: principal.subject,
      context: 'lab',
      memberships: [{
        id: `lab:${workspace.id}`,
        role: AdminRole.organizationAdmin,
        organizationId: workspace.organizationId,
        active: true,
      }],
    },
  };
}
