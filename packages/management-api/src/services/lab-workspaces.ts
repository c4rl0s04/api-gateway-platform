import {
  createPersonalLabWorkspace,
  getPersonalLabWorkspace,
  resetPersonalLabWorkspace,
  revokePersonalLabWorkspace,
  type LabPrincipal,
} from '@api-gateway/database';

export interface LabWorkspaceOperations {
  create(principal: LabPrincipal): Promise<unknown>;
  get(principal: LabPrincipal): Promise<unknown>;
  reset(principal: LabPrincipal): Promise<unknown>;
  revoke(principal: LabPrincipal): Promise<unknown>;
}

export class LabWorkspaceService implements LabWorkspaceOperations {
  create(principal: LabPrincipal) {
    return createPersonalLabWorkspace(principal);
  }

  get(principal: LabPrincipal) {
    return getPersonalLabWorkspace(principal);
  }

  reset(principal: LabPrincipal) {
    return resetPersonalLabWorkspace(principal);
  }

  revoke(principal: LabPrincipal) {
    return revokePersonalLabWorkspace(principal);
  }
}
