import { prisma, verifyConsumerSecret } from '@api-gateway/database';
import { randomUUID } from 'node:crypto';
import {
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from 'jose';
import {
  oauthTokenPolicyConfigSchema,
  DEVELOPER_TOKEN_GRANT_TYPE,
  type BasePolicyConfig,
} from '@api-gateway/shared';
import {
  authorizedProducts,
  credentialMatchesWorkspace,
  findCredential,
  isCredentialValid,
  uniqueValues,
  type CredentialRecord,
} from '../../auth/authorization.js';
import { getOAuthRuntime } from '../../oauth/runtime.js';
import { getRedisClient } from '../../redis/client.js';
import type { PolicyFactory } from '../types.js';
import { respond } from '../types.js';

const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const OAUTH_HEADERS = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
  'content-type': 'application/json; charset=utf-8',
};

class AssertionReplayError extends Error {}

interface DeveloperGrant {
  grantId: string;
  subject: string;
  organizationId: string;
  environmentId: string;
  productIds: string[];
  proxyIds: string[];
  scopes: string[];
  ttlSeconds: number;
}

interface PublicKeyRecord {
  status: string;
  algorithm: string;
  jwk: unknown;
  validFrom: Date;
  expiresAt: Date | null;
}

export interface OAuthTokenPolicyDependencies {
  findCredential: typeof findCredential;
  verifySecret: typeof verifyConsumerSecret;
  findPublicKey: (
    credentialId: string,
    kid: string,
  ) => Promise<PublicKeyRecord | null>;
  consumeAssertion: (
    credentialId: string,
    jti: string,
    ttlSeconds: number,
  ) => Promise<boolean>;
}

const defaultDependencies: OAuthTokenPolicyDependencies = {
  findCredential,
  verifySecret: verifyConsumerSecret,
  findPublicKey: (credentialId, kid) => prisma.appPublicKey.findUnique({
    where: { credentialId_kid: { credentialId, kid } },
  }),
  consumeAssertion: async (credentialId, jti, ttlSeconds) =>
    await getRedisClient().set(
      `oauth:assertion:${credentialId}:${jti}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    ) === 'OK',
};

function oauthError(
  statusCode: number,
  error: string,
  description: string,
) {
  return respond(statusCode, { error, error_description: description }, OAUTH_HEADERS);
}

function parseBasicAuthorization(value: string | undefined): [string, string] | null {
  if (!value?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 1) return null;
    return [
      decodeURIComponent(decoded.slice(0, separator)),
      decodeURIComponent(decoded.slice(separator + 1)),
    ];
  } catch {
    return null;
  }
}

async function authenticateJwtAssertion(
  assertion: string,
  tokenEndpointAudience: string,
  dependencies: OAuthTokenPolicyDependencies,
): Promise<CredentialRecord | null> {
  let header: ReturnType<typeof decodeProtectedHeader>;
  let unverified: JWTPayload;
  try {
    header = decodeProtectedHeader(assertion);
    unverified = decodeJwt(assertion);
  } catch {
    return null;
  }
  if (
    header.alg !== 'RS256'
    || typeof header.kid !== 'string'
    || typeof unverified.iss !== 'string'
    || unverified.iss !== unverified.sub
  ) {
    return null;
  }

  const credential = await dependencies.findCredential(unverified.iss);
  if (!credential || !isCredentialValid(credential)) return null;

  const key = await dependencies.findPublicKey(credential.id, header.kid);
  const now = new Date();
  if (
    !key
    || key.status !== 'approved'
    || key.algorithm !== 'RS256'
    || key.validFrom > now
    || (key.expiresAt && key.expiresAt <= now)
  ) {
    return null;
  }

  const publicKey = await importJWK(key.jwk as Record<string, unknown>, 'RS256');
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(assertion, publicKey, {
      algorithms: ['RS256'],
      audience: tokenEndpointAudience,
      issuer: credential.consumerKey,
      subject: credential.consumerKey,
      requiredClaims: ['iat', 'exp', 'jti'],
      clockTolerance: 5,
    }));
  } catch {
    return null;
  }
  const { iat, exp, jti } = payload;
  const currentTime = Math.floor(Date.now() / 1000);
  if (
    !iat
    || !exp
    || !jti
    || iat > currentTime + 5
    || exp <= iat
    || exp - iat > 120
  ) return null;

  const ttl = Math.max(1, exp - currentTime);
  if (!await dependencies.consumeAssertion(credential.id, jti, ttl)) {
    throw new AssertionReplayError('JWT assertion replay detected');
  }
  return credential;
}

function requestedScopes(form: URLSearchParams): string[] {
  return uniqueValues((form.get('scope') ?? '').split(/\s+/).filter(Boolean));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0
    && value.every(item => typeof item === 'string' && item.length > 0);
}

async function authenticateDeveloperGrant(
  assertion: string,
  tokenEndpointAudience: string,
  environmentId: string,
  dependencies: OAuthTokenPolicyDependencies,
): Promise<DeveloperGrant | null> {
  const runtime = getOAuthRuntime();
  if (!runtime.developerTokenIssuanceKey) return null;
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(assertion, runtime.developerTokenIssuanceKey, {
      algorithms: ['HS256'],
      issuer: 'management-api',
      audience: tokenEndpointAudience,
      requiredClaims: ['sub', 'iat', 'nbf', 'exp', 'jti'],
      clockTolerance: 3,
    }));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    typeof payload.sub !== 'string'
    || typeof payload.jti !== 'string'
    || typeof payload.iat !== 'number'
    || typeof payload.exp !== 'number'
    || payload.exp - payload.iat > 30
    || payload.iat > now + 3
    || payload.environment_id !== environmentId
    || typeof payload.organization_id !== 'string'
    || payload.developer_subject !== payload.sub
    || !stringArray(payload.product_ids)
    || !stringArray(payload.proxy_ids)
    || typeof payload.scope !== 'string'
    || typeof payload.ttl_seconds !== 'number'
    || !Number.isInteger(payload.ttl_seconds)
    || payload.ttl_seconds < 60
    || payload.ttl_seconds > 900
  ) return null;
  const replayTtl = Math.max(1, payload.exp - now);
  if (!await dependencies.consumeAssertion('developer-token', payload.jti, replayTtl)) {
    throw new AssertionReplayError('Developer grant replay detected');
  }
  return {
    grantId: payload.jti,
    subject: payload.sub,
    organizationId: payload.organization_id,
    environmentId,
    productIds: payload.product_ids,
    proxyIds: payload.proxy_ids,
    scopes: uniqueValues(payload.scope.split(/\s+/).filter(Boolean)),
    ttlSeconds: payload.ttl_seconds,
  };
}

export function createOAuthTokenPolicyWithDependencies(
  rawConfig: BasePolicyConfig,
  dependencies: OAuthTokenPolicyDependencies,
): ReturnType<PolicyFactory> {
  const config = oauthTokenPolicyConfigSchema.parse(rawConfig);

  return async ctx => {
    if (ctx.endpoint.mode !== 'local') {
      return oauthError(500, 'server_error', 'Token policy requires a local endpoint');
    }
    const contentType = ctx.req.headers['content-type'];
    if (typeof contentType !== 'string'
      || !contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      return oauthError(415, 'invalid_request', 'Content-Type must be application/x-www-form-urlencoded');
    }

    const body = Buffer.isBuffer(ctx.req.body)
      ? ctx.req.body.toString('utf8')
      : String(ctx.req.body ?? '');
    const form = new URLSearchParams(body);
    const grantType = form.get('grant_type');
    if (!grantType || !config.grantTypes.includes(grantType as never)) {
      return oauthError(400, 'unsupported_grant_type', 'The requested grant type is not supported');
    }

    let credential: CredentialRecord | null = null;
    let developerGrant: DeveloperGrant | null = null;
    const tokenEndpointAudience = `${ctx.proxy.runtimePublicOrigin ?? ctx.proxy.environment.publicOrigin}/oauth/token`;
    try {
      if (grantType === 'client_credentials') {
        const authorization = ctx.req.headers.authorization;
        const basic = parseBasicAuthorization(
          Array.isArray(authorization) ? authorization[0] : authorization,
        );
        if (!basic) return oauthError(401, 'invalid_client', 'Client authentication failed');
        credential = await dependencies.findCredential(basic[0]);
        if (
          !credential
          || !credential.consumerSecretHash
          || !isCredentialValid(credential)
          || !credentialMatchesWorkspace(credential, ctx.proxy.workspaceId)
          || !await dependencies.verifySecret(basic[1], credential.consumerSecretHash)
        ) {
          return oauthError(401, 'invalid_client', 'Client authentication failed');
        }
      } else if (grantType === JWT_BEARER) {
        const assertion = form.get('assertion');
        if (!assertion) return oauthError(400, 'invalid_request', 'assertion is required');
        credential = await authenticateJwtAssertion(
          assertion,
          tokenEndpointAudience,
          dependencies,
        );
        if (!credential) return oauthError(400, 'invalid_grant', 'JWT assertion is invalid');
      } else if (grantType === DEVELOPER_TOKEN_GRANT_TYPE) {
        const assertion = form.get('developer_assertion');
        if (!assertion) {
          return oauthError(400, 'invalid_request', 'developer_assertion is required');
        }
        if (ctx.proxy.workspaceId) {
          return oauthError(400, 'invalid_grant', 'Developer tokens are unavailable in lab workspaces');
        }
        developerGrant = await authenticateDeveloperGrant(
          assertion,
          tokenEndpointAudience,
          ctx.proxy.environment.id,
          dependencies,
        );
        if (!developerGrant) {
          return oauthError(400, 'invalid_grant', 'Developer authorization is invalid');
        }
      }
    } catch (error) {
      ctx.req.log.error({ err: error, policyType: 'oauth-token' }, 'OAuth grant validation failed');
      if (error instanceof AssertionReplayError) {
        return oauthError(400, 'invalid_grant', 'JWT assertion is invalid or has already been used');
      }
      return oauthError(503, 'server_error', 'Authorization service is temporarily unavailable');
    }

    if (developerGrant) {
      const scopes = developerGrant.scopes;
      if (scopes.length === 0
        || scopes.some(scope => config.allowedScopes.length > 0
          && !config.allowedScopes.includes(scope))) {
        return oauthError(400, 'invalid_scope', 'One or more requested scopes are not allowed');
      }
      const now = Math.floor(Date.now() / 1000);
      const runtime = getOAuthRuntime();
      const token = await new SignJWT({
        token_kind: 'developer',
        client_id: developerGrant.subject,
        credential_id: developerGrant.grantId,
        organization_id: developerGrant.organizationId,
        environment_id: developerGrant.environmentId,
        product_ids: developerGrant.productIds,
        proxy_ids: developerGrant.proxyIds,
        scope: scopes.join(' '),
      })
        .setProtectedHeader({ alg: 'RS256', kid: runtime.signingKeyId, typ: 'JWT' })
        .setIssuer(ctx.proxy.environment.publicOrigin)
        .setSubject(developerGrant.subject)
        .setAudience(config.audience)
        .setIssuedAt(now)
        .setNotBefore(now)
        .setExpirationTime(now + developerGrant.ttlSeconds)
        .setJti(randomUUID())
        .sign(runtime.signingKey);
      return respond(200, {
        access_token: token,
        token_type: 'Bearer',
        expires_in: developerGrant.ttlSeconds,
        scope: scopes.join(' '),
      }, OAUTH_HEADERS);
    }

    if (!credential) return oauthError(401, 'invalid_client', 'Client authentication failed');
    if (!credentialMatchesWorkspace(credential, ctx.proxy.workspaceId)) {
      return oauthError(401, 'invalid_client', 'Client authentication failed');
    }
    const products = authorizedProducts(credential, ctx.proxy.environment.id);
    if (products.length === 0) {
      return oauthError(403, 'invalid_scope', 'The client has no approved products in this environment');
    }

    const availableScopes = uniqueValues(products.flatMap(product => product.scopes))
      .filter(scope => config.allowedScopes.length === 0 || config.allowedScopes.includes(scope));
    const requested = requestedScopes(form);
    const scopes = requested.length > 0 ? requested : availableScopes;
    if (scopes.some(scope => !availableScopes.includes(scope))) {
      return oauthError(400, 'invalid_scope', 'One or more requested scopes are not allowed');
    }

    const now = Math.floor(Date.now() / 1000);
    const runtime = getOAuthRuntime();
    const token = await new SignJWT({
      token_kind: 'application',
      client_id: credential.consumerKey,
      credential_id: credential.id,
      organization_id: credential.app.organizationId,
      environment_id: ctx.proxy.environment.id,
      product_ids: products.map(product => product.id),
      proxy_ids: uniqueValues(products.flatMap(product => product.proxyIds)),
      scope: scopes.join(' '),
      ...(ctx.proxy.workspaceId ? { workspace_id: ctx.proxy.workspaceId } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: runtime.signingKeyId, typ: 'JWT' })
      .setIssuer(ctx.proxy.runtimePublicOrigin ?? ctx.proxy.environment.publicOrigin)
      .setSubject(credential.appId)
      .setAudience(config.audience)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + config.accessTokenTtlSeconds)
      .setJti(randomUUID())
      .sign(runtime.signingKey);

    return respond(200, {
      access_token: token,
      token_type: 'Bearer',
      expires_in: config.accessTokenTtlSeconds,
      scope: scopes.join(' '),
    }, OAUTH_HEADERS);
  };
}

export const createOAuthTokenPolicy: PolicyFactory = rawConfig =>
  createOAuthTokenPolicyWithDependencies(rawConfig, defaultDependencies);
