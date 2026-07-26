import { z } from 'zod';

export const DEPLOYMENT_STAGES = ['qual', 'pprod', 'prod'] as const;
export const DEPLOYMENT_REGIONS = [
  'ce',
  'es',
  'de',
  'be',
  'fr',
  'us',
  'uk',
  'jp',
  'br',
  'kr',
] as const;

export const deploymentStageSchema = z.enum(DEPLOYMENT_STAGES);
export const deploymentRegionSchema = z.enum(DEPLOYMENT_REGIONS);

export const environmentConfigSchema = z.object({
  id: z.string().min(1),
  stage: deploymentStageSchema,
  region: deploymentRegionSchema,
});

export type DeploymentStage = z.infer<typeof deploymentStageSchema>;
export type DeploymentRegion = z.infer<typeof deploymentRegionSchema>;
export type EnvironmentConfig = z.infer<typeof environmentConfigSchema>;

const previousStage: Record<DeploymentStage, DeploymentStage | null> = {
  qual: null,
  pprod: 'qual',
  prod: 'pprod',
};

export function getRequiredPreviousStage(
  stage: DeploymentStage,
): DeploymentStage | null {
  return previousStage[stage];
}

export function canDeployToStage(
  stage: DeploymentStage,
  existingStages: Iterable<DeploymentStage>,
): boolean {
  const required = getRequiredPreviousStage(stage);
  return required === null || new Set(existingStages).has(required);
}

export function formatEnvironmentName(
  environment: Pick<EnvironmentConfig, 'stage' | 'region'>,
): string {
  return [environment.stage, environment.region].join('-');
}
