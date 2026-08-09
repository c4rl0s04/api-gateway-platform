import {
  apiKeyAuthPolicyConfigSchema,
  type BasePolicyConfig,
} from '@api-gateway/shared';
import type { PolicyFactory } from '../types';
import { CONTINUE, halt } from '../types';
import {
  authorizedProducts,
  credentialMatchesWorkspace,
  findCredential,
  isCredentialValid,
  type CredentialRecord,
} from '../../auth/authorization.js';

export interface ApiKeyPolicyDependencies {
  findCredential: (consumerKey: string) => Promise<CredentialRecord | null>;
}

const defaultDependencies: ApiKeyPolicyDependencies = {
  findCredential,
};

/**
 * API Key authentication policy with product-level authorization.
 *
 * Flow:
 * 1. Read the configured header (default: x-api-key).
 * 2. If missing → 401.
 * 3. Look up the consumerKey in AppCredential.
 * 4. If not found or inactive → 401.
 * 5. Check product authorization: the product must contain the current proxy
 *    and either be global or include the current environment. If not → 403.
 * 6. If everything passes → populate ctx.client and return CONTINUE.
 */
export function createApiKeyPolicyWithDependencies(
  rawConfig: BasePolicyConfig,
  dependencies: ApiKeyPolicyDependencies,
): ReturnType<PolicyFactory> {
  const config = apiKeyAuthPolicyConfigSchema.parse(rawConfig);
  const headerName = config.header.toLowerCase();

  return async (ctx) => {
    const consumerKey = ctx.req.headers[headerName];

    if (!consumerKey || typeof consumerKey !== 'string') {
      return halt(401, {
        error:   'Unauthorized',
        message: `Missing required authentication header: ${headerName}`,
      });
    }

    let credential: CredentialRecord | null;
    try {
      credential = await dependencies.findCredential(consumerKey);
    } catch (err) {
      ctx.req.log.error(
        {
          err,
          policyType: 'api-key-auth',
          failureMode: config.failureMode,
          proxyId: ctx.proxy.id,
        },
        'API key policy dependency failed',
      );

      ctx.state['api-key-auth.degraded'] = true;
      if (config.failureMode === 'open') {
        return CONTINUE;
      }

      return halt(503, {
        error: 'Service Unavailable',
        message: 'Authentication service is temporarily unavailable',
        requestId: ctx.req.id,
      });
    }

    if (!credential
      || !isCredentialValid(credential)
      || !credentialMatchesWorkspace(credential, ctx.proxy.workspaceId)) {
      // Same message for invalid and revoked keys:
      // don't reveal to an attacker whether the key ever existed.
      return halt(401, {
        error:   'Unauthorized',
        message: 'Invalid or revoked API key',
      });
    }

    const products = authorizedProducts(
      credential,
      ctx.proxy.environment.id,
      ctx.proxy.id,
    );

    if (products.length === 0) {
      return halt(403, {
        error:   'Forbidden',
        message: 'Your API key does not have access to this API in the current environment.',
      });
    }

    // Populate the client context for downstream policies (rate-limit, audit-log, etc.)
    ctx.client = {
      appId:          credential.appId,
      credentialId:   credential.id,
      consumerKey:    credential.consumerKey,
      organizationId: credential.app.organizationId,
      ...(ctx.proxy.workspaceId ? { workspaceId: ctx.proxy.workspaceId } : {}),
      productIds:     products.map(product => product.id),
      scopes:         [...new Set(products.flatMap(product => product.scopes))],
    };

    return CONTINUE;
  };
}

export const createApiKeyPolicy: PolicyFactory = (rawConfig) =>
  createApiKeyPolicyWithDependencies(rawConfig, defaultDependencies);
