import { ManagementApiError, managementFetch } from '@/lib/api-client';
import type {
  ConfiguredProxyResult,
  ProxyConfigurationValidation,
} from '@/lib/proxy-creation';

export type ProxyCreationStep = 0 | 1 | 2 | 3;

export interface ProxyCreationFailure {
  message: string;
  step?: ProxyCreationStep;
}

export function describeProxyCreationFailure(cause: unknown): ProxyCreationFailure {
  if (!(cause instanceof ManagementApiError)) {
    return { message: cause instanceof Error ? cause.message : 'The request could not be completed.' };
  }
  const failures: Record<string, ProxyCreationFailure> = {
    invalid_openapi: {
      message: 'The OpenAPI source is invalid. Check its version, references, paths, and operation IDs.',
      step: 1,
    },
    invalid_gateway_config: {
      message: 'The Gateway configuration is invalid. Review the base path, targets, and policy fields.',
      step: 2,
    },
    unknown_operation: {
      message: 'Gateway YAML references an operation that is not present in this OpenAPI document.',
      step: 2,
    },
    policy_not_supported: {
      message: 'The imported Gateway YAML uses a policy that business proxies cannot configure.',
      step: 2,
    },
    forbidden: {
      message: 'You no longer have permission to create proxies for this organization.',
      step: 0,
    },
  };
  if (cause.status === 413) {
    return { message: 'One of the uploaded sources exceeds the 5 MiB limit.', step: 1 };
  }
  return failures[cause.code ?? ''] ?? { message: cause.message };
}

function sourceBlob(source: string, mediaType: string): Blob {
  return new Blob([source], { type: mediaType });
}

export async function validateProxyConfiguration(input: {
  organizationId: string;
  openapiSource: string;
  openapiFilename?: string;
  gatewaySource?: string;
  gatewayFilename?: string;
}): Promise<ProxyConfigurationValidation> {
  const form = new FormData();
  form.set(
    'openapi',
    sourceBlob(input.openapiSource, 'application/yaml'),
    input.openapiFilename || 'openapi.yaml',
  );
  if (input.gatewaySource !== undefined) {
    form.set(
      'gateway',
      sourceBlob(input.gatewaySource, 'application/yaml'),
      input.gatewayFilename || 'gateway.yaml',
    );
  }
  return managementFetch<ProxyConfigurationValidation>(
    `organizations/${input.organizationId}/proxy-configurations/validate`,
    { method: 'POST', body: form },
  );
}

export async function createConfiguredProxy(input: {
  organizationId: string;
  name: string;
  openapiSource: string;
  openapiFilename?: string;
  gatewaySource: string;
}): Promise<ConfiguredProxyResult> {
  const form = new FormData();
  form.set('name', input.name.trim());
  form.set(
    'openapi',
    sourceBlob(input.openapiSource, 'application/yaml'),
    input.openapiFilename || 'openapi.yaml',
  );
  form.set(
    'gateway',
    sourceBlob(input.gatewaySource, 'application/yaml'),
    'gateway.yaml',
  );
  return managementFetch<ConfiguredProxyResult>(
    `organizations/${input.organizationId}/proxies/configured`,
    { method: 'POST', body: form },
  );
}
