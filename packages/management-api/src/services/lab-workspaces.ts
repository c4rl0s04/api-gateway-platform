import {
  AdminRole,
  createPersonalLabWorkspace,
  getPersonalLabWorkspace,
  resetPersonalLabWorkspace,
  revokePersonalLabWorkspace,
  type LabPrincipal,
} from '@api-gateway/database';
import type { AdminPrincipal } from '../auth/authorization.js';

export interface LabAuthorityProvisioner {
  createManaged(
    input: { organizationId: string; name: string; validityDays?: number },
    actor: AdminPrincipal,
  ): Promise<unknown>;
  setStatus(
    id: string,
    status: 'active' | 'retiring' | 'revoked',
    actor: AdminPrincipal,
  ): Promise<unknown>;
  publishRuntimeTrust(): Promise<void>;
}

export interface LabWorkspaceOperations {
  create(principal: LabPrincipal): Promise<unknown>;
  get(principal: LabPrincipal): Promise<unknown>;
  reset(principal: LabPrincipal): Promise<unknown>;
  revoke(principal: LabPrincipal): Promise<unknown>;
}

export class LabWorkspaceService implements LabWorkspaceOperations {
  constructor(private readonly authorities?: LabAuthorityProvisioner) {}

  async create(principal: LabPrincipal) {
    const result = await createPersonalLabWorkspace(principal);
    if (!result.created || !this.authorities) return result;
    const actor = this.platformActor(principal);
    try {
      const authority = await this.authorities.createManaged({
        organizationId: result.workspace.organizationId,
        name: 'Personal Lab Certificate Authority',
        validityDays: 2,
      }, actor) as { id: string };
      await this.authorities.setStatus(authority.id, 'active', actor);
      return result;
    } catch (error) {
      await revokePersonalLabWorkspace(principal).catch(() => undefined);
      await this.authorities.publishRuntimeTrust().catch(() => undefined);
      throw error;
    }
  }

  get(principal: LabPrincipal) {
    return getPersonalLabWorkspace(principal);
  }

  reset(principal: LabPrincipal) {
    return resetPersonalLabWorkspace(principal);
  }

  async revoke(principal: LabPrincipal) {
    const workspace = await revokePersonalLabWorkspace(principal);
    await this.authorities?.publishRuntimeTrust();
    return workspace;
  }

  private platformActor(principal: LabPrincipal): AdminPrincipal {
    return {
      issuer: principal.issuer,
      subject: principal.subject,
      context: 'lab',
      memberships: [{
        id: 'lab-authority-provisioner',
        role: AdminRole.platformAdmin,
        organizationId: null,
        active: true,
      }],
    };
  }
}
