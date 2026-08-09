import { hostname } from 'node:os';
import { z } from 'zod';

const environmentAllowlistSchema = z.preprocess(
  value => {
    if (typeof value !== 'string') {
      return value;
    }
    const environmentIds = value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    return environmentIds.length > 0 ? environmentIds : undefined;
  },
  z.array(z.string().trim().min(1)).optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),
  REDIS_URL: z.string()
    .url('REDIS_URL must be a valid Redis URL')
    .refine(
      value => value.startsWith('redis://') || value.startsWith('rediss://'),
      'REDIS_URL must use the redis:// or rediss:// protocol',
    )
    .default('redis://localhost:6379'),
  LOG_LEVEL: z.enum([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ]).default('info'),
  GATEWAY_INSTANCE_ID: z.string().trim().min(1).default(hostname()),
  GATEWAY_CONFIG_RECONCILE_SECONDS: z.coerce.number().int().min(1).max(60).default(10),
  GATEWAY_ENVIRONMENT_ALLOWLIST: environmentAllowlistSchema,
  OAUTH_SIGNING_PRIVATE_KEY_BASE64: z.string().trim().min(1).optional(),
  OAUTH_SIGNING_KEY_ID: z.string().trim().min(1).optional(),
  DEVELOPER_TOKEN_ISSUANCE_SECRET: z.string().trim().min(32).optional(),
  MTLS_TRUSTED_PROXY_CIDRS: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'test') {
    const required = [
      'OAUTH_SIGNING_PRIVATE_KEY_BASE64',
      'OAUTH_SIGNING_KEY_ID',
      'DEVELOPER_TOKEN_ISSUANCE_SECRET',
      'MTLS_TRUSTED_PROXY_CIDRS',
    ] as const;
    for (const key of required) {
      if (!value[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required outside tests`,
        });
      }
    }
  }
});

export type GatewayEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  return envSchema.parse(source);
}
