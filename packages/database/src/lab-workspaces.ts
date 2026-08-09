import { randomUUID } from 'node:crypto';
import {
  AdminRole,
  AuthorizationStatus,
  DeploymentStatus,
  LabWorkspaceStatus,
  OrganizationKind,
  Prisma,
} from './generated/index.js';
import { prisma } from './client.js';
import { recordGatewayConfigChange } from './gateway-config-changes.js';

const WORKSPACE_TTL_MS = 24 * 60 * 60 * 1000;
const CREATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CREATIONS_PER_WINDOW = 3;

export interface LabPrincipal {
  issuer: string;
  subject: string;
}

export type LabWorkspaceErrorCode =
  | 'lab_expired'
  | 'lab_limit_reached'
  | 'lab_resource_not_found';

export class LabWorkspaceError extends Error {
  constructor(
    public readonly code: LabWorkspaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LabWorkspaceError';
  }
}

const workspaceSelection = {
  id: true,
  ownerIssuer: true,
  ownerSubject: true,
  organizationId: true,
  hostname: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  organization: { select: { id: true, name: true, kind: true } },
  _count: {
    select: { deployments: true, upstreams: true },
  },
};

export async function createPersonalLabWorkspace(
  principal: LabPrincipal,
  now = new Date(),
) {
  return prisma.$transaction(async transaction => {
    await lockPrincipal(transaction, principal);
    const current = await transaction.labWorkspace.findFirst({
      where: {
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
        status: LabWorkspaceStatus.active,
      },
      select: workspaceSelection,
    });
    if (current && current.expiresAt > now) {
      return { workspace: current, created: false };
    }
    if (current) {
      await deactivateWorkspaceResources(
        transaction,
        current.id,
        current.organizationId,
        principal,
        LabWorkspaceStatus.expired,
        now,
      );
    }
    const recentCreations = await transaction.labWorkspace.count({
      where: {
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
        createdAt: { gte: new Date(now.getTime() - CREATION_WINDOW_MS) },
      },
    });
    if (recentCreations >= MAX_CREATIONS_PER_WINDOW) {
      throw new LabWorkspaceError(
        'lab_limit_reached',
        'A maximum of three lab workspaces may be created every 24 hours',
      );
    }
    const workspaceId = randomUUID();
    const organization = await transaction.organization.create({
      data: {
        name: `Personal Gateway Lab ${workspaceId.slice(0, 8)}`,
        kind: OrganizationKind.lab,
      },
      select: { id: true },
    });
    const workspace = await transaction.labWorkspace.create({
      data: {
        id: workspaceId,
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
        organizationId: organization.id,
        hostname: `${workspaceId}.lab.gateway.localhost`,
        expiresAt: new Date(now.getTime() + WORKSPACE_TTL_MS),
      },
      select: workspaceSelection,
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: principal.issuer,
        actorSubject: principal.subject,
        actorRole: AdminRole.viewer,
        organizationId: organization.id,
        action: 'labWorkspace.create',
        resourceType: 'LabWorkspace',
        resourceId: workspace.id,
        metadata: {
          actorKind: 'labUser',
          hostname: workspace.hostname,
          expiresAt: workspace.expiresAt.toISOString(),
        },
      },
    });
    return { workspace, created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getPersonalLabWorkspace(
  principal: LabPrincipal,
  now = new Date(),
) {
  const current = await prisma.labWorkspace.findFirst({
    where: {
      ownerIssuer: principal.issuer,
      ownerSubject: principal.subject,
      status: LabWorkspaceStatus.active,
    },
    select: workspaceSelection,
  });
  if (!current) {
    throw new LabWorkspaceError(
      'lab_resource_not_found',
      'No active personal lab workspace exists',
    );
  }
  if (current.expiresAt <= now) {
    await expirePersonalLabWorkspace(current.id, now);
    throw new LabWorkspaceError('lab_expired', 'Personal lab workspace has expired');
  }
  return current;
}

export async function revokePersonalLabWorkspace(
  principal: LabPrincipal,
  now = new Date(),
) {
  return prisma.$transaction(async transaction => {
    await lockPrincipal(transaction, principal);
    const workspace = await transaction.labWorkspace.findFirst({
      where: {
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
        status: LabWorkspaceStatus.active,
      },
      select: { id: true, organizationId: true },
    });
    if (!workspace) {
      throw new LabWorkspaceError(
        'lab_resource_not_found',
        'No active personal lab workspace exists',
      );
    }
    await deactivateWorkspaceResources(
      transaction,
      workspace.id,
      workspace.organizationId,
      principal,
      LabWorkspaceStatus.revoked,
      now,
    );
    return transaction.labWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
      select: workspaceSelection,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resetPersonalLabWorkspace(
  principal: LabPrincipal,
  now = new Date(),
) {
  return prisma.$transaction(async transaction => {
    await lockPrincipal(transaction, principal);
    const workspace = await transaction.labWorkspace.findFirst({
      where: {
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
        status: LabWorkspaceStatus.active,
      },
      select: { id: true, organizationId: true, expiresAt: true },
    });
    if (!workspace) {
      throw new LabWorkspaceError(
        'lab_resource_not_found',
        'No active personal lab workspace exists',
      );
    }
    if (workspace.expiresAt <= now) {
      await deactivateWorkspaceResources(
        transaction,
        workspace.id,
        workspace.organizationId,
        principal,
        LabWorkspaceStatus.expired,
        now,
      );
      throw new LabWorkspaceError('lab_expired', 'Personal lab workspace has expired');
    }
    await disableWorkspaceResources(
      transaction,
      workspace.id,
      workspace.organizationId,
      principal,
      now,
      'labWorkspace.reset',
    );
    return transaction.labWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
      select: workspaceSelection,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function expireDueLabWorkspaces(
  now = new Date(),
): Promise<number> {
  const due = await prisma.labWorkspace.findMany({
    where: {
      status: LabWorkspaceStatus.active,
      expiresAt: { lte: now },
    },
    select: { id: true },
  });
  for (const workspace of due) {
    await expirePersonalLabWorkspace(workspace.id, now);
  }
  return due.length;
}

async function expirePersonalLabWorkspace(
  workspaceId: string,
  now: Date,
): Promise<void> {
  await prisma.$transaction(async transaction => {
    const workspace = await transaction.labWorkspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        organizationId: true,
        ownerIssuer: true,
        ownerSubject: true,
        status: true,
      },
    });
    if (!workspace || workspace.status !== LabWorkspaceStatus.active) return;
    await deactivateWorkspaceResources(
      transaction,
      workspace.id,
      workspace.organizationId,
      { issuer: workspace.ownerIssuer, subject: workspace.ownerSubject },
      LabWorkspaceStatus.expired,
      now,
    );
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function deactivateWorkspaceResources(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  organizationId: string,
  principal: LabPrincipal,
  status: typeof LabWorkspaceStatus.expired | typeof LabWorkspaceStatus.revoked,
  now: Date,
): Promise<void> {
  await disableWorkspaceResources(
    transaction,
    workspaceId,
    organizationId,
    principal,
    now,
    status === LabWorkspaceStatus.expired
      ? 'labWorkspace.expire'
      : 'labWorkspace.revoke',
  );
  await transaction.certificateAuthority.updateMany({
    where: { organizationId, status: { in: ['draft', 'active', 'retiring'] } },
    data: { status: 'revoked', isDefaultIssuer: false },
  });
  await transaction.labWorkspace.update({
    where: { id: workspaceId },
    data: { status },
  });
}

async function disableWorkspaceResources(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  organizationId: string,
  principal: LabPrincipal,
  now: Date,
  action: string,
): Promise<void> {
  const deployments = await transaction.proxyDeployment.findMany({
    where: { labWorkspaceId: workspaceId, status: DeploymentStatus.active },
    select: { id: true, environmentId: true },
  });
  await transaction.proxyDeployment.updateMany({
    where: { labWorkspaceId: workspaceId, status: DeploymentStatus.active },
    data: { status: DeploymentStatus.retired },
  });
  await transaction.apiProxy.updateMany({
    where: { organizationId },
    data: { active: false },
  });
  await transaction.developerApp.updateMany({
    where: { organizationId },
    data: { status: AuthorizationStatus.revoked },
  });
  await transaction.appCredential.updateMany({
    where: { app: { organizationId } },
    data: { status: AuthorizationStatus.revoked },
  });
  await transaction.credentialProductGrant.updateMany({
    where: { credential: { app: { organizationId } } },
    data: { status: AuthorizationStatus.revoked },
  });
  await transaction.appPublicKey.updateMany({
    where: { credential: { app: { organizationId } } },
    data: { status: AuthorizationStatus.revoked },
  });
  await transaction.appCertificate.updateMany({
    where: { credential: { app: { organizationId } } },
    data: {
      status: AuthorizationStatus.revoked,
      revokedAt: now,
      revocationReason: action,
    },
  });
  await transaction.labUpstream.updateMany({
    where: { workspaceId },
    data: { active: false },
  });
  for (const deployment of deployments) {
    await recordGatewayConfigChange(transaction, {
      changeType: 'labWorkspace.routesRemoved',
      resourceType: 'LabWorkspace',
      resourceId: workspaceId,
      environmentId: deployment.environmentId,
    });
  }
  await transaction.auditEvent.create({
    data: {
      actorIssuer: principal.issuer,
      actorSubject: principal.subject,
      actorRole: AdminRole.viewer,
      organizationId,
      action,
      resourceType: 'LabWorkspace',
      resourceId: workspaceId,
      metadata: {
        actorKind: 'labUser',
        retiredDeploymentIds: deployments.map(deployment => deployment.id),
      },
    },
  });
}

async function lockPrincipal(
  transaction: Prisma.TransactionClient,
  principal: LabPrincipal,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${'lab:' + principal.issuer + ':' + principal.subject}))
  `;
}
