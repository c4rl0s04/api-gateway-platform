import {
  createLabUpstream,
  listLabUpstreams,
  updateLabUpstream,
  type LabMockRoute,
  type LabPrincipal,
} from '@api-gateway/database';
import { resolveLabRequestContext } from './lab-context.js';

export type LabUpstreamMutation = {
  name: string;
  active?: boolean;
} & (
  | { kind: 'mock'; routes: LabMockRoute[] }
  | { kind: 'publicHttps'; targetUrl: string }
);

export type LabUpstreamUpdate = {
  name?: string;
  active?: boolean;
} & (
  | { kind?: 'mock'; routes?: LabMockRoute[]; targetUrl?: never }
  | { kind?: 'publicHttps'; targetUrl?: string; routes?: never }
);

export interface LabUpstreamOperations {
  list(principal: LabPrincipal): Promise<unknown>;
  create(input: LabUpstreamMutation, principal: LabPrincipal): Promise<unknown>;
  update(
    upstreamId: string,
    input: LabUpstreamUpdate,
    principal: LabPrincipal,
  ): Promise<unknown>;
}

export class LabUpstreamService implements LabUpstreamOperations {
  async list(principal: LabPrincipal) {
    const { workspace } = await resolveLabRequestContext(principal);
    return listLabUpstreams(workspace.id);
  }

  async create(input: LabUpstreamMutation, principal: LabPrincipal) {
    const { workspace } = await resolveLabRequestContext(principal);
    return createLabUpstream({
      workspaceId: workspace.id,
      ...input,
      actor: principal,
    });
  }

  async update(
    upstreamId: string,
    input: LabUpstreamUpdate,
    principal: LabPrincipal,
  ) {
    const { workspace } = await resolveLabRequestContext(principal);
    return updateLabUpstream({
      upstreamId,
      workspaceId: workspace.id,
      ...input,
      actor: principal,
    });
  }
}
