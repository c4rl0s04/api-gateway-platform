import type { LabPrincipal } from '@api-gateway/database';
import type { AuditOperations, AuditQuery } from './audit.js';
import { resolveLabRequestContext } from './lab-context.js';

export type LabAuditQuery = Omit<AuditQuery, 'organizationId'>;

export interface LabAuditOperations {
  list(query: LabAuditQuery, principal: LabPrincipal): Promise<unknown>;
}

export class LabAuditService implements LabAuditOperations {
  constructor(private readonly audit: AuditOperations) {}

  async list(query: LabAuditQuery, principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.audit.list({
      ...query,
      organizationId: workspace.organizationId,
    }, actor);
  }
}
