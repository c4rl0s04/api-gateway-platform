import { z } from 'zod';

export const envSchema = z.object({
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  DATABASE_URL: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().trim().min(1).default('management-api'),
  OIDC_JWKS_URI: z.string().url().optional(),
  PKI_KEYSTORE_DIR: z.string().trim().min(1),
  PKI_MASTER_KEY_FILE: z.string().trim().min(1),
  PKI_TRUST_BUNDLE_FILE: z.string().trim().min(1),
  PKI_CRL_BUNDLE_FILE: z.string().trim().min(1),
  PKI_SDS_TRIGGER_FILE: z.string().trim().min(1),
});

export type ManagementEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ManagementEnv {
  return envSchema.parse(source);
}
