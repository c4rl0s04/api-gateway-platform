import { normalizeCertificateFingerprint, prisma } from '@api-gateway/database';
import { mtlsAuthPolicyConfigSchema, type BasePolicyConfig } from '@api-gateway/shared';
import {
  authorizedProducts,
  isCredentialValid,
  type CredentialRecord,
} from '../../auth/authorization.js';
import { isTrustedProxy } from '../../oauth/runtime.js';
import type { PolicyFactory } from '../types.js';
import { CONTINUE, halt } from '../types.js';

interface CertificateRecord {
  status: string;
  validFrom: Date;
  expiresAt: Date | null;
  credential: CredentialRecord;
}

export interface MtlsPolicyDependencies {
  isTrustedProxy: (address: string) => boolean;
  findCertificate: (fingerprint: string) => Promise<CertificateRecord | null>;
}

const defaultDependencies: MtlsPolicyDependencies = {
  isTrustedProxy,
  findCertificate: fingerprint => prisma.appCertificate.findUnique({
    where: { fingerprintSha256: fingerprint },
    include: {
      credential: {
        include: {
          app: true,
          productGrants: {
            include: {
              product: {
                include: {
                  proxies: { select: { id: true } },
                  environments: { select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  }) as unknown as Promise<CertificateRecord | null>,
};

export function createMtlsPolicyWithDependencies(
  rawConfig: BasePolicyConfig,
  dependencies: MtlsPolicyDependencies,
): ReturnType<PolicyFactory> {
  const config = mtlsAuthPolicyConfigSchema.parse(rawConfig);
  return async ctx => {
    const immediateAddress = ctx.req.raw.socket.remoteAddress;
    if (!immediateAddress || !dependencies.isTrustedProxy(immediateAddress)) {
      return halt(401, { error: 'Unauthorized', message: 'mTLS headers are not from a trusted ingress' });
    }
    const rawFingerprint = ctx.req.headers['x-gateway-client-cert-sha256'];
    if (typeof rawFingerprint !== 'string') {
      return halt(401, { error: 'Unauthorized', message: 'Client certificate fingerprint is missing' });
    }

    let fingerprint: string;
    try {
      fingerprint = normalizeCertificateFingerprint(rawFingerprint);
    } catch {
      return halt(401, { error: 'Unauthorized', message: 'Client certificate fingerprint is invalid' });
    }

    try {
      const certificate = await dependencies.findCertificate(fingerprint);
      const now = new Date();
      if (
        !certificate
        || certificate.status !== 'approved'
        || certificate.validFrom > now
        || (certificate.expiresAt && certificate.expiresAt <= now)
        || !isCredentialValid(certificate.credential, 'mtls', now)
      ) {
        return halt(401, { error: 'Unauthorized', message: 'Invalid or revoked client certificate' });
      }
      const products = authorizedProducts(
        certificate.credential,
        ctx.proxy.environment.id,
        ctx.proxy.id,
      );
      if (products.length === 0) {
        return halt(403, { error: 'Forbidden', message: 'Certificate is not authorized for this API' });
      }
      ctx.client = {
        appId: certificate.credential.appId,
        credentialId: certificate.credential.id,
        consumerKey: certificate.credential.consumerKey,
        organizationId: certificate.credential.app.organizationId,
        productIds: products.map(product => product.id),
        scopes: [...new Set(products.flatMap(product => product.scopes))],
      };
      return CONTINUE;
    } catch (error) {
      ctx.req.log.error({ err: error, policyType: 'mtls-auth' }, 'mTLS policy dependency failed');
      if (config.failureMode === 'open') return CONTINUE;
      return halt(503, {
        error: 'Service Unavailable',
        message: 'Certificate authentication is temporarily unavailable',
        requestId: ctx.req.id,
      });
    }
  };
}

export const createMtlsPolicy: PolicyFactory = rawConfig =>
  createMtlsPolicyWithDependencies(rawConfig, defaultDependencies);
