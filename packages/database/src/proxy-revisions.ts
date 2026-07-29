import {
  AdminRole,
  EndpointMode,
  HttpMethod,
  Prisma,
} from './generated/index.js';
import { prisma } from './client.js';
import { compileProxyBundle } from './proxy-bundle.js';

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

export interface ImportProxyRevisionInput {
  proxyId: string;
  openapiSource: string;
  gatewayConfigSource: string;
  actor: ProxyMutationActor;
  allowSystemManaged?: boolean;
}

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

export async function createApiProxy(input: CreateApiProxyInput) {
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new Error('Proxy name must contain between 1 and 120 characters');
  }
  return prisma.$transaction(async transaction => {
    const organization = await transaction.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new ProxyRevisionError(
        'organization_not_found',
        'Organization does not exist',
      );
    }
    const proxy = await transaction.apiProxy.create({
      data: {
        id: input.id,
        name,
        organizationId: input.organizationId,
        systemManaged: input.systemManaged ?? false,
      },
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
        organizationId: input.organizationId,
        action: 'proxy.create',
        resourceType: 'ApiProxy',
        resourceId: proxy.id,
        metadata: { name, systemManaged: proxy.systemManaged },
      },
    });
    return proxy;
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
    const created = await transaction.apiProxyRevision.create({
      data: {
        proxyId: input.proxyId,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
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
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: proxy.organizationId,
        action: 'proxyRevision.import',
        resourceType: 'ApiProxyRevision',
        resourceId: created.id,
        metadata: {
          proxyId: input.proxyId,
          revisionNumber: created.revisionNumber,
          contentHash: bundle.contentHash,
        },
      },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
