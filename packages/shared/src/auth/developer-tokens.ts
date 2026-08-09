import { z } from 'zod';

export const DEVELOPER_TOKEN_GRANT_TYPE =
  'urn:api-gateway:params:oauth:grant-type:developer-token' as const;

const uniqueIdentifiers = (maximum: number) => z.array(
  z.string().trim().min(1).max(120),
).min(1).max(maximum).refine(values => new Set(values).size === values.length, {
  message: 'Values must be unique',
});

export const developerTokenRequestSchema = z.object({
  environmentId: z.string().trim().min(1).max(120),
  productIds: uniqueIdentifiers(20),
  proxyIds: uniqueIdentifiers(50),
  scopes: uniqueIdentifiers(100),
  ttlSeconds: z.number().int().min(60).max(900).default(600),
}).strict();

export type DeveloperTokenRequest = z.infer<typeof developerTokenRequestSchema>;

export interface DeveloperTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  authorizedProxies: string[];
  scopes: string[];
}
