import type { PolicyFactory } from './types';
import type { BasePolicyConfig, PolicyType } from '@api-gateway/shared';
import { createApiKeyPolicy } from './auth/api-key.policy';
import { createRateLimitPolicy } from './rate-limit/rate-limit.policy';
import { createMtlsPolicy } from './auth/mtls.policy.js';
import { createJwksEndpointPolicy } from './oauth/jwks-endpoint.policy.js';
import { createOAuthAccessTokenPolicy } from './oauth/oauth-access-token.policy.js';
import { createOAuthTokenPolicy } from './oauth/oauth-token.policy.js';

/**
 * Registro global de factories de políticas.
 * Clave: PolicyType (string literal)
 * Valor: función factory que crea una Policy a partir de su config
 */
const registry = new Map<PolicyType, PolicyFactory>();

/**
 * Registra una factory para un tipo de política.
 * Lanza si se intenta registrar el mismo tipo dos veces (bug de configuración).
 */
export function registerPolicy(type: PolicyType, factory: PolicyFactory): void {
  if (registry.has(type)) {
    throw new Error(`Policy type "${type}" is already registered. Duplicate registration.`);
  }
  registry.set(type, factory);
}

/**
 * Crea una instancia de política a partir de su tipo y config.
 * Lanza con mensaje claro si el tipo no está registrado.
 */
export function createPolicy(
  type: PolicyType,
  config: BasePolicyConfig,
): ReturnType<PolicyFactory> {
  const factory = registry.get(type);
  if (!factory) {
    const available = [...registry.keys()].join(', ');
    throw new Error(
      `No policy registered for type: "${type}". Registered types: [${available}]`,
    );
  }
  return factory(config);
}

/**
 * Registra todas las políticas built-in del gateway.
 * Se llama una vez al arrancar el servidor, antes de aceptar tráfico.
 *
 * Security and traffic policies are registered here as factories.
 */
export function registerBuiltinPolicies(): void {
  if (!registry.has('api-key-auth')) {
    registerPolicy('api-key-auth', createApiKeyPolicy);
  }
  if (!registry.has('rate-limit')) {
    registerPolicy('rate-limit', createRateLimitPolicy);
  }
  if (!registry.has('oauth-token')) {
    registerPolicy('oauth-token', createOAuthTokenPolicy);
  }
  if (!registry.has('oauth-access-token')) {
    registerPolicy('oauth-access-token', createOAuthAccessTokenPolicy);
  }
  if (!registry.has('jwks-endpoint')) {
    registerPolicy('jwks-endpoint', createJwksEndpointPolicy);
  }
  if (!registry.has('mtls-auth')) {
    registerPolicy('mtls-auth', createMtlsPolicy);
  }
}

/** Clears the registry so isolated server instances and tests can start cleanly. */
export function clearPolicyRegistry(): void {
  registry.clear();
}
