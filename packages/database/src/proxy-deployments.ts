import {
  AdminRole,
  DeploymentStage,
  DeploymentStatus,
  Prisma,
} from './generated/index.js';
import { prisma } from './client.js';
import { recordGatewayConfigChange } from './gateway-config-changes.js';

export interface DeploymentMutationActor {
  issuer: string;
  subject: string;
  role: AdminRole;
}

export type ProxyDeploymentErrorCode =
  | 'proxy_not_found'
  | 'revision_not_found'
  | 'environment_not_found'
  | 'system_proxy_immutable'
  | 'upstream_required'
  | 'promotion_required'
  | 'deployment_conflict'
  | 'active_deployment_not_found';

export class ProxyDeploymentError extends Error {
  constructor(
    public readonly code: ProxyDeploymentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProxyDeploymentError';
  }
}

export interface DeployProxyRevisionInput {
  proxyId: string;
  revisionNumber: number;
  environmentId: string;
  upstreamBaseUrl?: string | null;
  actor: DeploymentMutationActor;
  allowSystemManaged?: boolean;
}

export interface RetireProxyDeploymentInput {
  deploymentId: string;
  actor: DeploymentMutationActor;
  allowSystemManaged?: boolean;
}

function previousStage(stage: DeploymentStage): DeploymentStage | null {
  if (stage === DeploymentStage.pprod) return DeploymentStage.qual;
  if (stage === DeploymentStage.prod) return DeploymentStage.pprod;
  return null;
}

function normalizeUpstream(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProxyDeploymentError('upstream_required', 'upstreamBaseUrl must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ProxyDeploymentError('upstream_required', 'upstreamBaseUrl must use http or https');
  }
  return value.replace(/\/+$/, '');
}

export async function deployProxyRevision(input: DeployProxyRevisionInput) {
  const upstreamBaseUrl = normalizeUpstream(input.upstreamBaseUrl);
  return prisma.$transaction(async transaction => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${'proxy-deployment:' + input.proxyId + ':' + input.environmentId}))
    `;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${'environment-base-path:' + input.environmentId}))
    `;
    const proxy = await transaction.apiProxy.findUnique({
      where: { id: input.proxyId },
      select: { id: true, organizationId: true, systemManaged: true },
    });
    if (!proxy) throw new ProxyDeploymentError('proxy_not_found', 'Proxy does not exist');
    if (proxy.systemManaged && !input.allowSystemManaged) {
      throw new ProxyDeploymentError(
        'system_proxy_immutable',
        'System-managed proxies cannot be deployed through the public API',
      );
    }
    const revision = await transaction.apiProxyRevision.findUnique({
      where: {
        proxyId_revisionNumber: {
          proxyId: input.proxyId,
          revisionNumber: input.revisionNumber,
        },
      },
      select: {
        id: true,
        basePath: true,
        operations: { select: { mode: true } },
      },
    });
    if (!revision) {
      throw new ProxyDeploymentError('revision_not_found', 'Proxy revision does not exist');
    }
    const environment = await transaction.environment.findUnique({
      where: { id: input.environmentId },
      select: { id: true, stage: true, region: true },
    });
    if (!environment) {
      throw new ProxyDeploymentError('environment_not_found', 'Environment does not exist');
    }
    if (revision.operations.some(operation => operation.mode === 'forward') && !upstreamBaseUrl) {
      throw new ProxyDeploymentError(
        'upstream_required',
        'upstreamBaseUrl is required for a forwarding revision',
      );
    }

    const requiredStage = previousStage(environment.stage);
    if (requiredStage) {
      const promoted = await transaction.proxyDeployment.findFirst({
        where: {
          revisionId: revision.id,
          environment: { stage: requiredStage, region: environment.region },
          status: { in: [DeploymentStatus.active, DeploymentStatus.retired] },
        },
        select: { id: true },
      });
      if (!promoted) {
        throw new ProxyDeploymentError(
          'promotion_required',
          `Revision ${input.revisionNumber} must be deployed to ${requiredStage} in ${environment.region} first`,
        );
      }
    }

    const conflict = await transaction.proxyDeployment.findFirst({
      where: {
        environmentId: input.environmentId,
        status: DeploymentStatus.active,
        proxyId: { not: input.proxyId },
        revision: { basePath: revision.basePath },
      },
      select: { proxyId: true },
    });
    if (conflict) {
      throw new ProxyDeploymentError(
        'deployment_conflict',
        `basePath ${revision.basePath} is already active in this environment`,
      );
    }

    const previous = await transaction.proxyDeployment.findFirst({
      where: {
        proxyId: input.proxyId,
        environmentId: input.environmentId,
        status: DeploymentStatus.active,
      },
      select: {
        id: true,
        revision: { select: { revisionNumber: true } },
      },
    });
    if (previous) {
      await transaction.proxyDeployment.update({
        where: { id: previous.id },
        data: { status: DeploymentStatus.retired },
      });
    }
    const deployment = await transaction.proxyDeployment.create({
      data: {
        proxyId: input.proxyId,
        revisionId: revision.id,
        environmentId: input.environmentId,
        upstreamBaseUrl,
        status: DeploymentStatus.active,
      },
      include: {
        revision: {
          select: { revisionNumber: true, basePath: true, contentHash: true },
        },
        environment: {
          select: { id: true, stage: true, region: true, publicOrigin: true },
        },
      },
    });
    const rollback = previous
      ? input.revisionNumber < previous.revision.revisionNumber
      : false;
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: proxy.organizationId,
        action: previous ? 'proxyDeployment.replace' : 'proxyDeployment.create',
        resourceType: 'ProxyDeployment',
        resourceId: deployment.id,
        metadata: {
          proxyId: input.proxyId,
          revisionNumber: input.revisionNumber,
          environmentId: input.environmentId,
          replacedDeploymentId: previous?.id ?? null,
          rollback,
        },
      },
    });
    const configChange = await recordGatewayConfigChange(transaction, {
      changeType: rollback
        ? 'proxyDeployment.rollback'
        : previous
          ? 'proxyDeployment.replace'
          : 'proxyDeployment.create',
      resourceType: 'ProxyDeployment',
      resourceId: deployment.id,
      environmentId: input.environmentId,
    });
    return { ...deployment, configVersion: configChange.version };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function retireProxyDeployment(
  input: RetireProxyDeploymentInput,
) {
  return prisma.$transaction(async transaction => {
    const current = await transaction.proxyDeployment.findUnique({
      where: { id: input.deploymentId },
      select: {
        id: true,
        proxyId: true,
        environmentId: true,
        status: true,
        proxy: {
          select: { organizationId: true, systemManaged: true },
        },
      },
    });
    if (!current || current.status !== DeploymentStatus.active) {
      throw new ProxyDeploymentError(
        'active_deployment_not_found',
        'Active proxy deployment does not exist',
      );
    }
    if (current.proxy.systemManaged && !input.allowSystemManaged) {
      throw new ProxyDeploymentError(
        'system_proxy_immutable',
        'System-managed proxy deployments cannot be retired through the public API',
      );
    }
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${'proxy-deployment:' + current.proxyId + ':' + current.environmentId}))
    `;
    const active = await transaction.proxyDeployment.findFirst({
      where: { id: input.deploymentId, status: DeploymentStatus.active },
      select: { id: true },
    });
    if (!active) {
      throw new ProxyDeploymentError(
        'active_deployment_not_found',
        'Active proxy deployment does not exist',
      );
    }
    const deployment = await transaction.proxyDeployment.update({
      where: { id: input.deploymentId },
      data: { status: DeploymentStatus.retired },
      include: {
        revision: {
          select: { revisionNumber: true, basePath: true, contentHash: true },
        },
        environment: {
          select: { id: true, stage: true, region: true, publicOrigin: true },
        },
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: current.proxy.organizationId,
        action: 'proxyDeployment.retire',
        resourceType: 'ProxyDeployment',
        resourceId: input.deploymentId,
        metadata: {
          proxyId: current.proxyId,
          environmentId: current.environmentId,
        },
      },
    });
    const configChange = await recordGatewayConfigChange(transaction, {
      changeType: 'proxyDeployment.retire',
      resourceType: 'ProxyDeployment',
      resourceId: deployment.id,
      environmentId: current.environmentId,
    });
    return { ...deployment, configVersion: configChange.version };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function listProxyDeployments(proxyId: string) {
  return prisma.proxyDeployment.findMany({
    where: { proxyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      proxyId: true,
      revisionId: true,
      environmentId: true,
      upstreamBaseUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      revision: {
        select: { revisionNumber: true, basePath: true, contentHash: true },
      },
      environment: {
        select: { id: true, stage: true, region: true, publicOrigin: true },
      },
    },
  });
}
