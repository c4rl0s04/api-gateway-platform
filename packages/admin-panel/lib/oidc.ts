import { createHash, randomBytes } from 'node:crypto';

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function publicApplicationUrl(callbackUrl: string): URL {
  return new URL('/', callbackUrl);
}

export function oidcConfig() {
  const issuer = process.env.OIDC_ISSUER
    ?? 'http://localhost:8081/realms/api-gateway';
  const internalBaseUrl = process.env.OIDC_INTERNAL_BASE_URL
    ?? 'http://localhost:8081';
  return {
    issuer,
    clientId: process.env.OIDC_CLIENT_ID ?? 'admin-panel',
    callbackUrl: process.env.OIDC_CALLBACK_URL
      ?? 'http://localhost:8080/api/auth/callback',
    authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${internalBaseUrl}/realms/api-gateway/protocol/openid-connect/token`,
  };
}
