import { Prisma } from './generated/index.js';
import { prisma } from './client.js';

export interface RecordGatewayConfigChangeInput {
  changeType: string;
  resourceType: string;
  resourceId: string;
  environmentId?: string | null;
}

export function recordGatewayConfigChange(
  transaction: Prisma.TransactionClient,
  input: RecordGatewayConfigChangeInput,
) {
  return transaction.gatewayConfigChange.create({
    data: {
      changeType: input.changeType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      environmentId: input.environmentId,
    },
    select: { version: true, createdAt: true },
  });
}

export async function getLatestGatewayConfigVersion(): Promise<number> {
  const latest = await prisma.gatewayConfigChange.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return latest?.version ?? 0;
}

export function listPendingGatewayConfigChanges(limit = 100) {
  return prisma.gatewayConfigChange.findMany({
    where: { publishedAt: null },
    orderBy: { version: 'asc' },
    take: limit,
    select: {
      version: true,
      changeType: true,
      resourceType: true,
      resourceId: true,
      environmentId: true,
      createdAt: true,
      publishAttempts: true,
      lastError: true,
    },
  });
}

export function countPendingGatewayConfigChanges(): Promise<number> {
  return prisma.gatewayConfigChange.count({ where: { publishedAt: null } });
}

export function markGatewayConfigChangePublished(version: number) {
  return prisma.gatewayConfigChange.update({
    where: { version },
    data: {
      publishedAt: new Date(),
      publishAttempts: { increment: 1 },
      lastError: null,
    },
    select: { version: true, publishedAt: true },
  });
}

export function markGatewayConfigChangePublishFailed(
  version: number,
  error: string,
) {
  return prisma.gatewayConfigChange.update({
    where: { version },
    data: {
      publishAttempts: { increment: 1 },
      lastError: error.slice(0, 1_000),
    },
    select: { version: true, publishAttempts: true, lastError: true },
  });
}
