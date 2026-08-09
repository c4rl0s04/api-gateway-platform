import {
  resolveLabUpstreamInternalUrl,
  type LabPrincipal,
} from '@api-gateway/database';
import type { GatewayCatalogOperations } from './gateway-catalog.js';
import type {
  CreateConfiguredProxyInput,
  CreateProxyInput,
  ImportRevisionInput,
  ProxyRevisionOperations,
  UpdateProxyInput,
  ValidateProxyConfigurationInput,
} from './proxy-revisions.js';
import { resolveLabRequestContext } from './lab-context.js';

export interface LabProxyOperations {
  list(principal: LabPrincipal): Promise<unknown>;
  get(proxyId: string, principal: LabPrincipal): Promise<unknown>;
  listDeployments(proxyId: string, principal: LabPrincipal): Promise<unknown>;
  create(input: CreateProxyInput, principal: LabPrincipal): Promise<unknown>;
  validate(input: ValidateProxyConfigurationInput, principal: LabPrincipal): Promise<unknown>;
  createConfigured(input: CreateConfiguredProxyInput, principal: LabPrincipal): Promise<unknown>;
  update(proxyId: string, input: UpdateProxyInput, principal: LabPrincipal): Promise<unknown>;
  importRevision(proxyId: string, input: ImportRevisionInput, principal: LabPrincipal): Promise<unknown>;
  listRevisions(proxyId: string, principal: LabPrincipal): Promise<unknown>;
  getRevision(proxyId: string, revisionNumber: number, principal: LabPrincipal): Promise<unknown>;
  deploy(
    proxyId: string,
    revisionNumber: number,
    input: { environmentId: string; upstreamId: string },
    principal: LabPrincipal,
  ): Promise<unknown>;
  retire(deploymentId: string, principal: LabPrincipal): Promise<unknown>;
}

export class LabProxyService implements LabProxyOperations {
  constructor(
    private readonly catalog: GatewayCatalogOperations,
    private readonly revisions: ProxyRevisionOperations,
  ) {}

  async list(principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.catalog.listProxies(actor);
  }

  async get(proxyId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.catalog.getProxy(proxyId, actor);
  }

  async listDeployments(proxyId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.catalog.listDeployments(proxyId, actor);
  }

  async create(input: CreateProxyInput, principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.revisions.createProxy(workspace.organizationId, input, actor);
  }

  async validate(input: ValidateProxyConfigurationInput, principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.revisions.validateConfiguration(workspace.organizationId, input, actor);
  }

  async createConfigured(input: CreateConfiguredProxyInput, principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.revisions.createConfiguredProxy(workspace.organizationId, input, actor);
  }

  async update(proxyId: string, input: UpdateProxyInput, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.revisions.updateProxy(proxyId, input, actor);
  }

  async importRevision(
    proxyId: string,
    input: ImportRevisionInput,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.revisions.importRevision(proxyId, input, actor);
  }

  async listRevisions(proxyId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.revisions.listRevisions(proxyId, actor);
  }

  async getRevision(
    proxyId: string,
    revisionNumber: number,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.revisions.getRevision(proxyId, revisionNumber, actor);
  }

  async deploy(
    proxyId: string,
    revisionNumber: number,
    input: { environmentId: string; upstreamId: string },
    principal: LabPrincipal,
  ) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    const upstreamBaseUrl = await resolveLabUpstreamInternalUrl(
      workspace.id,
      input.upstreamId,
    );
    return this.revisions.deployRevision(proxyId, revisionNumber, {
      environmentId: input.environmentId,
      upstreamBaseUrl,
      labWorkspaceId: workspace.id,
    }, actor);
  }

  async retire(deploymentId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.revisions.retireDeployment(deploymentId, actor);
  }
}
