import type { AdminSession } from '@/lib/session';
import type {
  DeploymentStage,
  Environment,
  ProxyDeployment,
  RuntimeSyncStatus,
} from '@/lib/api-client';

const stageOrder: Record<DeploymentStage, number> = {
  qual: 0,
  pprod: 1,
  prod: 2,
};

export function canManageOrganization(
  session: AdminSession,
  organizationId: string,
): boolean {
  return session.principal?.memberships.some(membership =>
    membership.role === 'platformAdmin'
    || (
      membership.role === 'organizationAdmin'
      && membership.organizationId === organizationId
    )) ?? false;
}

export function environmentLabel(environment: Pick<Environment, 'stage' | 'region'>) {
  return `${environment.stage.toUpperCase()} · ${environment.region.toUpperCase()}`;
}

export function sortEnvironments(environments: Environment[]): Environment[] {
  return [...environments].sort((left, right) =>
    left.region.localeCompare(right.region)
    || stageOrder[left.stage] - stageOrder[right.stage]);
}

export function isPromotionEligible(
  environment: Environment,
  revisionNumber: number,
  deployments: ProxyDeployment[],
): boolean {
  const previousStage = environment.stage === 'prod'
    ? 'pprod'
    : environment.stage === 'pprod' ? 'qual' : null;
  if (!previousStage) return true;
  return deployments.some(deployment =>
    deployment.revision.revisionNumber === revisionNumber
    && deployment.environment.region === environment.region
    && deployment.environment.stage === previousStage);
}

export function runtimeHasApplied(
  status: RuntimeSyncStatus,
  targetVersion: number,
): boolean {
  return status.gateways.length > 0
    && status.gateways.every(gateway =>
      gateway.state === 'applied'
      && gateway.appliedVersion >= targetVersion);
}
