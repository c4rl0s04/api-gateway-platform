import { managementFetch } from '@/lib/api-client';
import type {
  ConfiguredProxyResult,
  ProxyConfigurationValidation,
} from '@/lib/proxy-creation';

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
