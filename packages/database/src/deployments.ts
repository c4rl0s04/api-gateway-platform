import {
  canDeployToStage,
  getRequiredPreviousStage,
  type DeploymentStage,
} from '@api-gateway/shared';
import { prisma } from './client.js';

export interface CreateProxyDeploymentInput {
  id?: string;
  proxyId: string;
  environmentId: string;
  upstreamBaseUrl: string;
  active?: boolean;
}

export class DeploymentProgressionError extends Error {
  constructor(
    public readonly targetStage: DeploymentStage,
    public readonly requiredStage: DeploymentStage,
  ) {
    super(
      `Cannot deploy to "${targetStage}" before a "${requiredStage}" deployment exists in the same region`,
    );
    this.name = 'DeploymentProgressionError';
  }
}

function validateUpstreamBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('upstreamBaseUrl must use http:// or https://');
  }
  return value.replace(/\/+$/, '');
}

/**
 * Creates a deployment while enforcing qual -> pprod -> prod progression for
 * the same proxy and region.
 */
export async function createProxyDeployment(
  input: CreateProxyDeploymentInput,
) {
  const upstreamBaseUrl = validateUpstreamBaseUrl(input.upstreamBaseUrl);

  return prisma.$transaction(async transaction => {
    const environment = await transaction.environment.findUniqueOrThrow({
      where: { id: input.environmentId },
    });

    const existingDeployments = await transaction.proxyDeployment.findMany({
      where: {
        proxyId: input.proxyId,
        environment: {
          region: environment.region,
        },
      },
      select: {
        environment: {
          select: { stage: true },
        },
      },
    });

    const existingStages = existingDeployments.map(
      deployment => deployment.environment.stage as DeploymentStage,
    );
    const targetStage = environment.stage as DeploymentStage;

    if (!canDeployToStage(targetStage, existingStages)) {
      const requiredStage = getRequiredPreviousStage(targetStage);
      if (requiredStage) {
        throw new DeploymentProgressionError(targetStage, requiredStage);
      }
    }

    return transaction.proxyDeployment.create({
      data: {
        id: input.id,
        proxyId: input.proxyId,
        environmentId: input.environmentId,
        upstreamBaseUrl,
        active: input.active ?? true,
      },
    });
  });
}
