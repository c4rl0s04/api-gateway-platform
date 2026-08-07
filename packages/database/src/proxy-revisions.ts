import {
  AdminRole,
  EndpointMode,
  HttpMethod,
  Prisma,
} from './generated/index.js';
import { prisma } from './client.js';
import { compileProxyBundle } from './proxy-bundle.js';
import type { CompiledProxyBundle } from './proxy-bundle.js';
import { recordGatewayConfigChange } from './gateway-config-changes.js';

export interface ProxyMutationActor {
  issuer: string;
  subject: string;
  role: AdminRole;
}

export type ProxyRevisionErrorCode =
  | 'organization_not_found'
  | 'proxy_not_found'
  | 'system_proxy_immutable';

export class ProxyRevisionError extends Error {
  constructor(
    public readonly code: ProxyRevisionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProxyRevisionError';
  }
}

export interface CreateApiProxyInput {
  id?: string;
  organizationId: string;
  name: string;
  actor: ProxyMutationActor;
  systemManaged?: boolean;
}

export interface CreateConfiguredApiProxyInput {
  organizationId: string;
  name: string;
  openapiSource: string;
  gatewayConfigSource: string;
  actor: ProxyMutationActor;
}

export interface UpdateApiProxyInput {
  proxyId: string;
  name?: string;
  active?: boolean;
  actor: ProxyMutationActor;
}

export interface ImportProxyRevisionInput {
  proxyId: string;
  openapiSource: string;
  gatewayConfigSource: string;
  actor: ProxyMutationActor;
  allowSystemManaged?: boolean;
}

const proxySelection = {
  id: true,
  name: true,
  active: true,
  systemManaged: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
};

const revisionSelection = {
  id: true,
  proxyId: true,
  revisionNumber: true,
  basePath: true,
  openapiVersion: true,
  contentHash: true,
  createdAt: true,
  operations: {
    orderBy: [{ path: 'asc' as const }, { method: 'asc' as const }],
    select: {
      id: true,
      operationId: true,
      method: true,
      mode: true,
      path: true,
      targetPath: true,
      policies: {
        orderBy: { order: 'asc' as const },
        select: {
          id: true,
          type: true,
          order: true,
          enabled: true,
          config: true,
        },
      },
    },
  },
};

function normalizeProxyName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 120) {
    throw new Error('Proxy name must contain between 1 and 120 characters');
  }
  return name;
}

async function requireOrganization(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const organization = await transaction.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) {
    throw new ProxyRevisionError(
      'organization_not_found',
      'Organization does not exist',
    );
  }
}

function createRevisionRecord(
  transaction: Prisma.TransactionClient,
  proxyId: string,
  revisionNumber: number,
  bundle: CompiledProxyBundle,
) {
  return transaction.apiProxyRevision.create({
    data: {
      proxyId,
      revisionNumber,
      basePath: bundle.basePath,
      openapiVersion: bundle.openapiVersion,
      openapiSource: bundle.openapiSource,
      openapiDocument: bundle.openapiDocument as Prisma.InputJsonValue,
      gatewayConfigSource: bundle.gatewayConfigSource,
      gatewayConfig: bundle.gatewayConfig as Prisma.InputJsonValue,
      contentHash: bundle.contentHash,
      operations: {
        create: bundle.operations.map(operation => ({
          operationId: operation.operationId,
          method: operation.method as HttpMethod,
          mode: operation.mode as EndpointMode,
          path: operation.path,
          targetPath: operation.targetPath,
          policies: {
            create: operation.policies.map(policy => ({
              type: policy.type,
              order: policy.order,
              enabled: policy.enabled,
              config: policy.config as Prisma.InputJsonValue,
            })),
          },
        })),
      },
    },
    select: revisionSelection,
  });
}

function recordProxyAudit(
  transaction: Prisma.TransactionClient,
  input: {
    proxyId: string;
    organizationId: string;
    name: string;
    systemManaged: boolean;
    actor: ProxyMutationActor;
  },
) {
  return transaction.auditEvent.create({
    data: {
      actorIssuer: input.actor.issuer,
      actorSubject: input.actor.subject,
      actorRole: input.actor.role,
      organizationId: input.organizationId,
      action: 'proxy.create',
      resourceType: 'ApiProxy',
      resourceId: input.proxyId,
      metadata: { name: input.name, systemManaged: input.systemManaged },
    },
  });
}

function recordRevisionAudit(
  transaction: Prisma.TransactionClient,
  input: {
    proxyId: string;
    revisionId: string;
    revisionNumber: number;
    contentHash: string;
    organizationId: string;
    actor: ProxyMutationActor;
  },
) {
  return transaction.auditEvent.create({
    data: {
      actorIssuer: input.actor.issuer,
      actorSubject: input.actor.subject,
      actorRole: input.actor.role,
      organizationId: input.organizationId,
      action: 'proxyRevision.import',
      resourceType: 'ApiProxyRevision',
      resourceId: input.revisionId,
      metadata: {
        proxyId: input.proxyId,
        revisionNumber: input.revisionNumber,
        contentHash: input.contentHash,
      },
    },
  });
}

export async function createApiProxy(input: CreateApiProxyInput) {
  const name = normalizeProxyName(input.name);
  return prisma.$transaction(async transaction => {
    await requireOrganization(transaction, input.organizationId);
    const proxy = await transaction.apiProxy.create({
      data: {
        id: input.id,
        name,
        organizationId: input.organizationId,
        systemManaged: input.systemManaged ?? false,
      },
      select: proxySelection,
    });
    await recordProxyAudit(transaction, {
      proxyId: proxy.id,
      organizationId: input.organizationId,
      name,
      systemManaged: proxy.systemManaged,
      actor: input.actor,
    });
    return proxy;
  });
}

export async function createConfiguredApiProxy(
  input: CreateConfiguredApiProxyInput,
) {
  const name = normalizeProxyName(input.name);
  const bundle = await compileProxyBundle({
    openapiSource: input.openapiSource,
    gatewayConfigSource: input.gatewayConfigSource,
    systemManaged: false,
  });
  return prisma.$transaction(async transaction => {
    await requireOrganization(transaction, input.organizationId);
    const proxy = await transaction.apiProxy.create({
      data: {
        name,
        organizationId: input.organizationId,
        systemManaged: false,
      },
      select: proxySelection,
    });
    const revision = await createRevisionRecord(transaction, proxy.id, 1, bundle);
    await recordProxyAudit(transaction, {
      proxyId: proxy.id,
      organizationId: input.organizationId,
      name,
      systemManaged: false,
      actor: input.actor,
    });
    await recordRevisionAudit(transaction, {
      proxyId: proxy.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      contentHash: revision.contentHash,
      organizationId: input.organizationId,
      actor: input.actor,
    });
    return {
      proxy,
      revision: { ...revision, warnings: bundle.warnings },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function updateApiProxy(input: UpdateApiProxyInput) {
  const name = input.name?.trim();
  if (name !== undefined && (!name || name.length > 120)) {
    throw new Error('Proxy name must contain between 1 and 120 characters');
  }
  return prisma.$transaction(async transaction => {
    const current = await transaction.apiProxy.findUnique({
      where: { id: input.proxyId },
      select: {
        id: true,
        name: true,
        active: true,
        systemManaged: true,
        organizationId: true,
      },
    });
    if (!current) {
      throw new ProxyRevisionError('proxy_not_found', 'Proxy does not exist');
    }
    if (current.systemManaged) {
      throw new ProxyRevisionError(
        'system_proxy_immutable',
        'System-managed proxies cannot be modified',
      );
    }
    const proxy = await transaction.apiProxy.update({
      where: { id: input.proxyId },
      data: { name, active: input.active },
      select: {
        id: true,
        name: true,
        active: true,
        systemManaged: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: current.organizationId,
        action: 'proxy.update',
        resourceType: 'ApiProxy',
        resourceId: input.proxyId,
        metadata: {
          changedFields: [
            ...(name !== undefined ? ['name'] : []),
            ...(input.active !== undefined ? ['active'] : []),
          ],
          previousName: current.name,
          previousActive: current.active,
        },
      },
    });
    const activeChanged = input.active !== undefined
      && input.active !== current.active;
    const configChange = activeChanged
      ? await recordGatewayConfigChange(transaction, {
          changeType: proxy.active ? 'proxy.activate' : 'proxy.deactivate',
          resourceType: 'ApiProxy',
          resourceId: proxy.id,
        })
      : null;
    return { ...proxy, configVersion: configChange?.version ?? null };
  });
}

export async function importProxyRevision(input: ImportProxyRevisionInput) {
  const proxy = await prisma.apiProxy.findUnique({
    where: { id: input.proxyId },
    select: { id: true, organizationId: true, systemManaged: true },
  });
  if (!proxy) {
    throw new ProxyRevisionError('proxy_not_found', 'Proxy does not exist');
  }
  if (proxy.systemManaged && !input.allowSystemManaged) {
    throw new ProxyRevisionError(
      'system_proxy_immutable',
      'System-managed proxies cannot be modified',
    );
  }
  const bundle = await compileProxyBundle({
    openapiSource: input.openapiSource,
    gatewayConfigSource: input.gatewayConfigSource,
    systemManaged: proxy.systemManaged,
  });

  const revision = await prisma.$transaction(async transaction => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${'proxy-revision:' + input.proxyId}))
    `;
    const latest = await transaction.apiProxyRevision.findFirst({
      where: { proxyId: input.proxyId },
      orderBy: { revisionNumber: 'desc' },
      select: { revisionNumber: true },
    });
    const created = await createRevisionRecord(
      transaction,
      input.proxyId,
      (latest?.revisionNumber ?? 0) + 1,
      bundle,
    );
    await recordRevisionAudit(transaction, {
      proxyId: input.proxyId,
      revisionId: created.id,
      revisionNumber: created.revisionNumber,
      contentHash: bundle.contentHash,
      organizationId: proxy.organizationId,
      actor: input.actor,
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  return { ...revision, warnings: bundle.warnings };
}

export function listProxyRevisions(proxyId: string) {
  return prisma.apiProxyRevision.findMany({
    where: { proxyId },
    orderBy: { revisionNumber: 'desc' },
    select: {
      id: true,
      proxyId: true,
      revisionNumber: true,
      basePath: true,
      openapiVersion: true,
      contentHash: true,
      createdAt: true,
      _count: { select: { operations: true, deployments: true } },
    },
  });
}

export function getProxyRevision(proxyId: string, revisionNumber: number) {
  return prisma.apiProxyRevision.findUnique({
    where: { proxyId_revisionNumber: { proxyId, revisionNumber } },
    select: revisionSelection,
  });
}

export function getProxyRevisionSource(
  proxyId: string,
  revisionNumber: number,
  source: 'openapi' | 'gateway',
) {
  return prisma.apiProxyRevision.findUnique({
    where: { proxyId_revisionNumber: { proxyId, revisionNumber } },
    select: source === 'openapi'
      ? { openapiSource: true }
      : { gatewayConfigSource: true },
  });
}
