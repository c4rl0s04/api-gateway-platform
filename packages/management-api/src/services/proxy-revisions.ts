import {
  AdminRole,
  compileProxyBundle,
  createApiProxy,
  createConfiguredApiProxy,
  deployProxyRevision,
  getProxyRevision,
  getProxyRevisionSource,
  importProxyRevision,
  inspectOpenApi,
  listProxyRevisions,
  prisma,
  retireProxyDeployment,
  updateApiProxy,
} from '@api-gateway/database';
import {
  canManageOrganization,
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';
import type { GatewayConfigNotifier } from '../runtime-sync/publisher.js';

export interface CreateProxyInput {
  name: string;
}

export interface ImportRevisionInput {
  openapiSource: string;
  gatewayConfigSource: string;
}

export interface ValidateProxyConfigurationInput {
  openapiSource: string;
  gatewayConfigSource?: string;
}

export interface CreateConfiguredProxyInput extends ImportRevisionInput {
  name: string;
}

export interface UpdateProxyInput {
  name?: string;
  active?: boolean;
}

export interface DeployRevisionInput {
  environmentId: string;
  upstreamBaseUrl?: string | null;
}

export interface ProxyRevisionOperations {
  createProxy(
    organizationId: string,
    input: CreateProxyInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  validateConfiguration(
    organizationId: string,
    input: ValidateProxyConfigurationInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  createConfiguredProxy(
    organizationId: string,
    input: CreateConfiguredProxyInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  updateProxy(
    proxyId: string,
    input: UpdateProxyInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  importRevision(
    proxyId: string,
    input: ImportRevisionInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  listRevisions(proxyId: string, actor: AdminPrincipal): Promise<unknown>;
  getRevision(
    proxyId: string,
    revisionNumber: number,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  getRevisionSource(
    proxyId: string,
    revisionNumber: number,
    source: 'openapi' | 'gateway',
    actor: AdminPrincipal,
  ): Promise<string>;
  deployRevision(
    proxyId: string,
    revisionNumber: number,
    input: DeployRevisionInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  retireDeployment(
    deploymentId: string,
    actor: AdminPrincipal,
  ): Promise<unknown>;
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function actorRole(actor: AdminPrincipal, organizationId: string): AdminRole {
  if (isPlatformAdmin(actor)) return AdminRole.platformAdmin;
  const membership = actor.memberships.find(candidate =>
    candidate.active
    && candidate.organizationId === organizationId
    && candidate.role === AdminRole.organizationAdmin);
  if (!membership) throw forbidden('Organization administration access denied');
  return membership.role;
}

async function proxyOrganization(proxyId: string): Promise<string> {
  const proxy = await prisma.apiProxy.findUnique({
    where: { id: proxyId },
    select: { organizationId: true },
  });
  if (!proxy) throw notFound('Proxy does not exist');
  return proxy.organizationId;
}

async function deploymentOrganization(deploymentId: string): Promise<string> {
  const deployment = await prisma.proxyDeployment.findUnique({
    where: { id: deploymentId },
    select: { proxy: { select: { organizationId: true } } },
  });
  if (!deployment) throw notFound('Proxy deployment does not exist');
  return deployment.proxy.organizationId;
}

export class ProxyRevisionService implements ProxyRevisionOperations {
  constructor(private readonly notifier?: GatewayConfigNotifier) {}

  private notify(result: unknown): void {
    const version = (result as { configVersion?: unknown })?.configVersion;
    if (typeof version === 'number') this.notifier?.notify(version);
  }

  async createProxy(
    organizationId: string,
    input: CreateProxyInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return createApiProxy({
      organizationId,
      name: input.name,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async validateConfiguration(
    organizationId: string,
    input: ValidateProxyConfigurationInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    if (!input.gatewayConfigSource) {
      return {
        openapi: await inspectOpenApi(input.openapiSource),
        compiled: null,
      };
    }
    const bundle = await compileProxyBundle({
      openapiSource: input.openapiSource,
      gatewayConfigSource: input.gatewayConfigSource,
      systemManaged: false,
    });
    return {
      openapi: {
        openapiVersion: bundle.openapiVersion,
        title: bundle.openapiTitle,
        operations: bundle.operations.map(operation => ({
          operationId: operation.operationId,
          method: operation.method,
          path: operation.path,
        })),
        warnings: bundle.warnings,
      },
      compiled: {
        basePath: bundle.basePath,
        gatewayConfig: bundle.gatewayConfig,
        contentHash: bundle.contentHash,
        operations: bundle.operations,
        warnings: bundle.warnings,
      },
    };
  }

  async createConfiguredProxy(
    organizationId: string,
    input: CreateConfiguredProxyInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return createConfiguredApiProxy({
      organizationId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async updateProxy(
    proxyId: string,
    input: UpdateProxyInput,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    const result = await updateApiProxy({
      proxyId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
    this.notify(result);
    const { configVersion: _configVersion, ...proxy } = result;
    return proxy;
  }

  async importRevision(
    proxyId: string,
    input: ImportRevisionInput,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return importProxyRevision({
      proxyId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async listRevisions(proxyId: string, actor: AdminPrincipal) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    return listProxyRevisions(proxyId);
  }

  async getRevision(
    proxyId: string,
    revisionNumber: number,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    const revision = await getProxyRevision(proxyId, revisionNumber);
    if (!revision) throw notFound('Proxy revision does not exist');
    return revision;
  }

  async getRevisionSource(
    proxyId: string,
    revisionNumber: number,
    source: 'openapi' | 'gateway',
    actor: AdminPrincipal,
  ): Promise<string> {
    const organizationId = await proxyOrganization(proxyId);
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    const revision = await getProxyRevisionSource(proxyId, revisionNumber, source);
    if (!revision) throw notFound('Proxy revision does not exist');
    return source === 'openapi'
      ? (revision as { openapiSource: string }).openapiSource
      : (revision as { gatewayConfigSource: string }).gatewayConfigSource;
  }

  async deployRevision(
    proxyId: string,
    revisionNumber: number,
    input: DeployRevisionInput,
    actor: AdminPrincipal,
  ) {
    const organizationId = await proxyOrganization(proxyId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    const result = await deployProxyRevision({
      proxyId,
      revisionNumber,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
    this.notify(result);
    return result;
  }

  async retireDeployment(deploymentId: string, actor: AdminPrincipal) {
    const organizationId = await deploymentOrganization(deploymentId);
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    const result = await retireProxyDeployment({
      deploymentId,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
    this.notify(result);
    return result;
  }
}
