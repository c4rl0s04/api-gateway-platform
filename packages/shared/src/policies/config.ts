import { z } from 'zod';

export const POLICY_TYPES = [
  'api-key-auth',
  'oauth-token',
  'oauth-access-token',
  'jwks-endpoint',
  'mtls-auth',
  'rate-limit',
  'transform',
  'schema-validation',
  'audit-log',
  'cors',
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];
export type PolicyFailureMode = 'open' | 'closed';

export const policyFailureModeSchema = z.enum(['open', 'closed']);

const basePolicyConfigSchema = z.object({
  /**
   * Controls what happens when the policy cannot evaluate because one of its
   * infrastructure dependencies is unavailable.
   */
  failureMode: policyFailureModeSchema.default('closed'),
}).passthrough();

export const apiKeyAuthPolicyConfigSchema = basePolicyConfigSchema.extend({
  header: z.string().trim().min(1).default('x-api-key'),
});

export const rateLimitPolicyConfigSchema = basePolicyConfigSchema.extend({
  limit: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
});

export const OAUTH_GRANT_TYPES = [
  'client_credentials',
  'urn:ietf:params:oauth:grant-type:jwt-bearer',
] as const;

export const oauthTokenPolicyConfigSchema = basePolicyConfigSchema.extend({
  grantTypes: z.array(z.enum(OAUTH_GRANT_TYPES)).min(1),
  accessTokenTtlSeconds: z.number().int().positive().max(3600).default(900),
  audience: z.string().trim().min(1),
  allowedScopes: z.array(z.string().trim().min(1)).default([]),
});

export const oauthAccessTokenPolicyConfigSchema = basePolicyConfigSchema.extend({
  audience: z.string().trim().min(1),
  requiredScopes: z.array(z.string().trim().min(1)).default([]),
});

export const mtlsAuthPolicyConfigSchema = basePolicyConfigSchema;
export const jwksEndpointPolicyConfigSchema = basePolicyConfigSchema;

export const genericPolicyConfigSchema = basePolicyConfigSchema;

export type BasePolicyConfig = z.infer<typeof basePolicyConfigSchema>;
export type ApiKeyAuthPolicyConfig = z.infer<typeof apiKeyAuthPolicyConfigSchema>;
export type RateLimitPolicyConfig = z.infer<typeof rateLimitPolicyConfigSchema>;
export type OAuthTokenPolicyConfig = z.infer<typeof oauthTokenPolicyConfigSchema>;
export type OAuthAccessTokenPolicyConfig = z.infer<typeof oauthAccessTokenPolicyConfigSchema>;
export type MtlsAuthPolicyConfig = z.infer<typeof mtlsAuthPolicyConfigSchema>;

export interface PolicyConfigByType {
  'api-key-auth': ApiKeyAuthPolicyConfig;
  'oauth-token': OAuthTokenPolicyConfig;
  'oauth-access-token': OAuthAccessTokenPolicyConfig;
  'jwks-endpoint': BasePolicyConfig;
  'mtls-auth': MtlsAuthPolicyConfig;
  'rate-limit': RateLimitPolicyConfig;
  'transform': BasePolicyConfig;
  'schema-validation': BasePolicyConfig;
  'audit-log': BasePolicyConfig;
  'cors': BasePolicyConfig;
}

export type PolicyConfig<T extends PolicyType = PolicyType> =
  T extends PolicyType
    ? {
        type: T;
        order: number;
        enabled: boolean;
        config: PolicyConfigByType[T];
      }
    : never;

const policyConfigSchemas: Record<PolicyType, z.ZodTypeAny> = {
  'api-key-auth': apiKeyAuthPolicyConfigSchema,
  'oauth-token': oauthTokenPolicyConfigSchema,
  'oauth-access-token': oauthAccessTokenPolicyConfigSchema,
  'jwks-endpoint': jwksEndpointPolicyConfigSchema,
  'mtls-auth': mtlsAuthPolicyConfigSchema,
  'rate-limit': rateLimitPolicyConfigSchema,
  'transform': genericPolicyConfigSchema,
  'schema-validation': genericPolicyConfigSchema,
  'audit-log': genericPolicyConfigSchema,
  'cors': genericPolicyConfigSchema,
};

export function isPolicyType(value: string): value is PolicyType {
  return (POLICY_TYPES as readonly string[]).includes(value);
}

export function parsePolicyConfig<T extends PolicyType>(
  type: T,
  config: unknown,
): PolicyConfigByType[T] {
  return policyConfigSchemas[type].parse(config ?? {}) as PolicyConfigByType[T];
}
