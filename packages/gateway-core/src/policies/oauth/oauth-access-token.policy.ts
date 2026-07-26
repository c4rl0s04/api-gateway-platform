import { jwtVerify } from 'jose';
import {
  oauthAccessTokenPolicyConfigSchema,
  type BasePolicyConfig,
} from '@api-gateway/shared';
import { getOAuthRuntime } from '../../oauth/runtime.js';
import type { PolicyFactory } from '../types.js';
import { CONTINUE, halt } from '../types.js';

export const createOAuthAccessTokenPolicy: PolicyFactory = (
  rawConfig: BasePolicyConfig,
) => {
  const config = oauthAccessTokenPolicyConfigSchema.parse(rawConfig);
  return async ctx => {
    const authorization = ctx.req.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value?.startsWith('Bearer ')) {
      return halt(401, { error: 'Unauthorized', message: 'Missing Bearer access token' });
    }

    try {
      const runtime = getOAuthRuntime();
      const verified = await jwtVerify(value.slice(7), runtime.verificationKey, {
        algorithms: ['RS256'],
        issuer: runtime.issuer,
        audience: config.audience,
        requiredClaims: ['sub', 'iat', 'nbf', 'exp', 'jti'],
      });
      const claims = verified.payload;
      if (
        verified.protectedHeader.kid !== runtime.signingKeyId
        ||
        typeof claims.sub !== 'string'
        || typeof claims.client_id !== 'string'
        || typeof claims.credential_id !== 'string'
        || claims.environment_id !== ctx.proxy.environment.id
        || !Array.isArray(claims.product_ids)
        || !Array.isArray(claims.proxy_ids)
        || !claims.product_ids.every(id => typeof id === 'string')
        || !claims.proxy_ids.every(id => typeof id === 'string')
        || !claims.proxy_ids.includes(ctx.proxy.id)
        || typeof claims.scope !== 'string'
      ) {
        return halt(403, { error: 'Forbidden', message: 'Access token is not valid for this API environment' });
      }
      const scopes = claims.scope.split(/\s+/).filter(Boolean);
      if (config.requiredScopes.some(scope => !scopes.includes(scope))) {
        return halt(403, { error: 'insufficient_scope', message: 'Required scope is missing' });
      }
      ctx.client = {
        appId: claims.sub,
        credentialId: claims.credential_id,
        consumerKey: claims.client_id,
        organizationId: ctx.proxy.organizationId,
        productIds: claims.product_ids.filter((id): id is string => typeof id === 'string'),
        scopes,
      };
      return CONTINUE;
    } catch {
      return halt(401, { error: 'Unauthorized', message: 'Invalid or expired Bearer access token' });
    }
  };
};
