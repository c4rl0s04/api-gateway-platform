import type { DeploymentStage, Organization } from '@/lib/api-client';

export interface CountedOption {
  value: string;
  label: string;
  code?: string;
  count: number;
}

export interface OrganizationOption extends Organization {
  count: number;
}

export interface StageOption {
  value: DeploymentStage;
  label: string;
  description: string;
  count: number;
}
