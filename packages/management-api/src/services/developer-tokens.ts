import { createHash, randomUUID } from 'node:crypto';
import { AdminRole, OrganizationKind, prisma } from '@api-gateway/database';
import {
  DEVELOPER_TOKEN_GRANT_TYPE,
  type DeveloperTokenRequest,
  type DeveloperTokenResponse,
} from '@api-gateway/shared';
import { SignJWT } from 'jose';
import {
  canManageOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';
import { ManagementError } from '../errors.js';

export interface DeveloperTokenSelection {
  organizationKind: string;
  environment: { id: string; stage: string; publicOrigin: string } | null;
  products: Array<{
    id: string;
    scopes: string[];
    proxyIds: string[];
    environmentIds: string[];
  }>;
  activeProxies: Array<{ id: string; systemManaged: boolean }>;
}

export interface DeveloperTokenCatalog {
  loadSelection(
    organizationId: string,
    input: DeveloperTokenRequest,
  ): Promise<DeveloperTokenSelection>;
  recordIssue(input: {
    organizationId: string;
    actor: AdminPrincipal;
    request: DeveloperTokenRequest;
    grantId: string;
  }): Promise<void>;
}

export interface DeveloperTokenIssuer {
  issue(input: {
    assertion: string;
    tokenEndpoint: string;
  }): Promise<{ accessToken: string; expiresIn: number }>;
}

export interface DeveloperTokenOperations {
  issue(
    organizationId: string,
    input: DeveloperTokenRequest,
    actor: AdminPrincipal,
  ): Promise<DeveloperTokenResponse>;
}

function actorRole(actor: AdminPrincipal, organizationId: string): AdminRole {
  if (isPlatformAdmin(actor)) return AdminRole.platformAdmin;
  const membership = actor.memberships.find(candidate =>
    candidate.active
    && candidate.organizationId === organizationId
    && candidate.role === AdminRole.organizationAdmin);
  if (!membership) {
    throw new ManagementError('forbidden', 403, 'Organization administration access denied');
  }
  return membership.role;
}

function developerSubject(actor: AdminPrincipal): string {
  return `developer:${createHash('sha256')
    .update(`${actor.issuer}\0${actor.subject}`)
    .digest('hex')}`;
}

export const prismaDeveloperTokenCatalog: DeveloperTokenCatalog = {
  async loadSelection(organizationId, input) {
    const [organization, environment, products, activeProxies] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { kind: true },
      }),
      prisma.environment.findUnique({
        where: { id: input.environmentId },
        select: { id: true, stage: true, publicOrigin: true },
      }),
      prisma.apiProduct.findMany({
        where: { id: { in: input.productIds }, organizationId, active: true },
        select: {
          id: true,
          scopes: true,
          proxies: { select: { id: true } },
          environments: { select: { id: true } },
        },
      }),
      prisma.apiProxy.findMany({
        where: {
          id: { in: input.proxyIds },
          organizationId,
          active: true,
          deployments: {
            some: {
              environmentId: input.environmentId,
              status: 'active',
              labWorkspaceId: null,
            },
          },
        },
        select: { id: true, systemManaged: true },
      }),
    ]);
    return {
      organizationKind: organization?.kind ?? 'missing',
      environment,
      products: products.map(product => ({
        id: product.id,
        scopes: product.scopes,
        proxyIds: product.proxies.map(proxy => proxy.id),
        environmentIds: product.environments.map(environmentItem => environmentItem.id),
      })),
      activeProxies,
    };
  },
  async recordIssue({ organizationId, actor, request, grantId }) {
    await prisma.auditEvent.create({
      data: {
        actorIssuer: actor.issuer,
        actorSubject: actor.subject,
        actorRole: actorRole(actor, organizationId),
        organizationId,
        action: 'developerToken.issue',
        resourceType: 'DeveloperAccessGrant',
        resourceId: grantId,
        metadata: {
          environmentId: request.environmentId,
          productIds: request.productIds,
          proxyIds: request.proxyIds,
          scopes: request.scopes,
          ttlSeconds: request.ttlSeconds,
        },
      },
    });
  },
};

export class GatewayDeveloperTokenIssuer implements DeveloperTokenIssuer {
  constructor(
    private readonly internalGatewayUrl: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async issue(input: { assertion: string; tokenEndpoint: string }) {
    const endpoint = new URL('/oauth/token', this.internalGatewayUrl);
    const publicEndpoint = new URL(input.tokenEndpoint);
    const body = new URLSearchParams({
      grant_type: DEVELOPER_TOKEN_GRANT_TYPE,
      developer_assertion: input.assertion,
    });
    const response = await this.fetchImplementation(endpoint, {
      method: 'POST',
      headers: {
        host: publicEndpoint.host,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new ManagementError(
        'developer_token_issuance_failed',
        502,
        'Gateway token issuer rejected the developer authorization',
      );
    }
    return {
      accessToken: payload.access_token,
      expiresIn: typeof payload.expires_in === 'number' ? payload.expires_in : 0,
    };
  }
}

export class DeveloperTokenService implements DeveloperTokenOperations {
  constructor(
    private readonly sharedSecret: string,
    private readonly issuer: DeveloperTokenIssuer,
    private readonly catalog: DeveloperTokenCatalog = prismaDeveloperTokenCatalog,
  ) {}

  async issue(
    organizationId: string,
    input: DeveloperTokenRequest,
    actor: AdminPrincipal,
  ): Promise<DeveloperTokenResponse> {
    if (!canManageOrganization(actor, organizationId)) {
      throw new ManagementError('forbidden', 403, 'Organization administration access denied');
    }
    const selection = await this.catalog.loadSelection(organizationId, input);
    if (selection.organizationKind !== OrganizationKind.standard) {
      throw new ManagementError('organization_not_found', 404, 'Organization does not exist');
    }
    if (!selection.environment) {
      throw new ManagementError('environment_not_found', 404, 'Environment does not exist');
    }
    if (selection.environment.stage !== 'qual') {
      throw new ManagementError(
        'developer_token_environment_forbidden',
        403,
        'Developer tokens are restricted to qual environments',
      );
    }
    if (selection.products.length !== input.productIds.length) {
      throw new ManagementError(
        'developer_token_product_invalid',
        409,
        'Every selected product must be active and belong to the organization',
      );
    }
    if (selection.products.some(product =>
      product.environmentIds.length > 0
      && !product.environmentIds.includes(input.environmentId))) {
      throw new ManagementError(
        'developer_token_product_invalid',
        409,
        'One or more products are unavailable in the selected environment',
      );
    }
    const productProxyIds = new Set(selection.products.flatMap(product => product.proxyIds));
    const activeProxyIds = new Set(selection.activeProxies
      .filter(proxy => !proxy.systemManaged)
      .map(proxy => proxy.id));
    if (input.proxyIds.some(proxyId =>
      !productProxyIds.has(proxyId) || !activeProxyIds.has(proxyId))) {
      throw new ManagementError(
        'developer_token_proxy_invalid',
        409,
        'Every selected proxy must be exposed by a selected product and actively deployed',
      );
    }
    const allowedScopes = new Set(selection.products.flatMap(product => product.scopes));
    if (input.scopes.some(scope => !allowedScopes.has(scope))) {
      throw new ManagementError(
        'invalid_scope',
        400,
        'One or more requested scopes are not allowed by the selected products',
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const grantId = randomUUID();
    const tokenEndpoint = new URL(
      '/oauth/token',
      selection.environment.publicOrigin,
    ).toString();
    const assertion = await new SignJWT({
      organization_id: organizationId,
      environment_id: input.environmentId,
      product_ids: input.productIds,
      proxy_ids: input.proxyIds,
      scope: input.scopes.join(' '),
      ttl_seconds: input.ttlSeconds,
      developer_subject: developerSubject(actor),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('management-api')
      .setSubject(developerSubject(actor))
      .setAudience(tokenEndpoint)
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 30)
      .setJti(grantId)
      .sign(new TextEncoder().encode(this.sharedSecret));
    const issued = await this.issuer.issue({ assertion, tokenEndpoint });
    await this.catalog.recordIssue({ organizationId, actor, request: input, grantId });
    return {
      accessToken: issued.accessToken,
      tokenType: 'Bearer',
      expiresIn: issued.expiresIn,
      authorizedProxies: input.proxyIds,
      scopes: input.scopes,
    };
  }
}
