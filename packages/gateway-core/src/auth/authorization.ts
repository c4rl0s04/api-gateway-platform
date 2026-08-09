import { prisma } from '@api-gateway/database';

export interface AuthorizedProduct {
  id: string;
  scopes: string[];
  proxyIds: string[];
}

export interface CredentialRecord {
  id: string;
  appId: string;
  consumerKey: string;
  consumerSecretHash: string;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
  app: {
    status: string;
    organizationId: string;
    organization?: {
      kind: string;
      labWorkspace: {
        id: string;
        status: string;
        expiresAt: Date;
      } | null;
    };
  };
  productGrants: Array<{
    status: string;
    scopes: string[];
    product: {
      id: string;
      organizationId: string;
      active: boolean;
      scopes: string[];
      proxies: Array<{ id: string }>;
      environments: Array<{ id: string }>;
    };
  }>;
}

export function findCredential(consumerKey: string): Promise<CredentialRecord | null> {
  return prisma.appCredential.findUnique({
    where: { consumerKey },
    include: {
      app: {
        include: {
          organization: { include: { labWorkspace: true } },
        },
      },
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
  }) as unknown as Promise<CredentialRecord | null>;
}

export function credentialMatchesWorkspace(
  credential: CredentialRecord,
  workspaceId: string | null | undefined,
  now = new Date(),
): boolean {
  const workspace = credential.app.organization?.labWorkspace;
  if (!workspaceId) {
    return credential.app.organization?.kind !== 'lab' && !workspace;
  }
  return credential.app.organization?.kind === 'lab'
    && workspace?.id === workspaceId
    && workspace.status === 'active'
    && workspace.expiresAt > now;
}

export function isCredentialValid(
  credential: CredentialRecord,
  now = new Date(),
): boolean {
  return credential.status === 'approved'
    && credential.app.status === 'approved'
    && credential.issuedAt <= now
    && (!credential.expiresAt || credential.expiresAt > now);
}

export function authorizedProducts(
  credential: CredentialRecord,
  environmentId: string,
  proxyId?: string,
): AuthorizedProduct[] {
  return credential.productGrants
    .filter(grant => grant.status === 'approved' && grant.product.active)
    .filter(grant =>
      grant.product.organizationId === credential.app.organizationId)
    .filter(grant =>
      grant.product.environments.length === 0
      || grant.product.environments.some(environment =>
        environment.id === environmentId))
    .filter(grant =>
      !proxyId || grant.product.proxies.some(proxy => proxy.id === proxyId))
    .map(grant => ({
      id: grant.product.id,
      scopes: grant.scopes.filter(scope => grant.product.scopes.includes(scope)),
      proxyIds: grant.product.proxies.map(proxy => proxy.id),
    }));
}

export function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}
