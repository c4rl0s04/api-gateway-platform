import { AdminRole, AuthorizationStatus } from './generated/index.js';
import { prisma } from './client.js';
import {
  generateConsumerKey,
  generateConsumerSecret,
  hashConsumerSecret,
} from './credentials.js';

export type ApplicationManagementErrorCode =
  | 'app_not_found'
  | 'credential_not_found'
  | 'product_not_found'
  | 'product_not_active'
  | 'organization_mismatch'
  | 'invalid_scope'
  | 'invalid_status_transition'
  | 'public_key_not_found';

export class ApplicationManagementError extends Error {
  constructor(
    public readonly code: ApplicationManagementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationManagementError';
  }
}

export interface ApplicationMutationActor {
  issuer: string;
  subject: string;
  role: AdminRole;
}

function validateStatusTransition(
  current: AuthorizationStatus,
  next: AuthorizationStatus,
): void {
  const allowed = current === next
    || current === AuthorizationStatus.pending
      && (next === AuthorizationStatus.approved
        || next === AuthorizationStatus.revoked)
    || current === AuthorizationStatus.approved
      && next === AuthorizationStatus.revoked;
  if (!allowed) {
    throw new ApplicationManagementError(
      'invalid_status_transition',
      `Cannot change authorization status from ${current} to ${next}`,
    );
  }
}

export interface UpdateDeveloperApplicationInput {
  appId: string;
  name?: string;
  status?: AuthorizationStatus;
  actor: ApplicationMutationActor;
}

export async function updateDeveloperApplication(
  input: UpdateDeveloperApplicationInput,
) {
  return prisma.$transaction(async transaction => {
    const current = await transaction.developerApp.findUnique({
      where: { id: input.appId },
      select: { id: true, name: true, status: true, organizationId: true },
    });
    if (!current) {
      throw new ApplicationManagementError(
        'app_not_found',
        'Developer application does not exist',
      );
    }
    if (input.status) validateStatusTransition(current.status, input.status);
    const application = await transaction.developerApp.update({
      where: { id: input.appId },
      data: { name: input.name?.trim(), status: input.status },
      select: {
        id: true,
        name: true,
        status: true,
        organizationId: true,
        createdAt: true,
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: current.organizationId,
        action: 'application.update',
        resourceType: 'DeveloperApp',
        resourceId: input.appId,
        metadata: {
          changedFields: [
            ...(input.name !== undefined ? ['name'] : []),
            ...(input.status !== undefined ? ['status'] : []),
          ],
          previousName: current.name,
          previousStatus: current.status,
        },
      },
    });
    return application;
  });
}

export interface CreateManagedCredentialInput {
  appId: string;
  expiresAt?: Date | null;
  products: Array<{ productId: string; scopes?: string[] }>;
  actor: ApplicationMutationActor;
}

export async function createManagedCredential(
  input: CreateManagedCredentialInput,
) {
  const productIds = input.products.map(product => product.productId);
  if (productIds.length === 0 || new Set(productIds).size !== productIds.length) {
    throw new ApplicationManagementError(
      'product_not_found',
      'Credentials require a unique, non-empty product list',
    );
  }
  const consumerKey = generateConsumerKey();
  const consumerSecret = generateConsumerSecret();
  const consumerSecretHash = await hashConsumerSecret(consumerSecret);
  const credential = await prisma.$transaction(async transaction => {
    const app = await transaction.developerApp.findUnique({
      where: { id: input.appId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!app) {
      throw new ApplicationManagementError(
        'app_not_found',
        'Developer application does not exist',
      );
    }
    if (app.status === AuthorizationStatus.revoked) {
      throw new ApplicationManagementError(
        'invalid_status_transition',
        'Cannot add credentials to a revoked application',
      );
    }
    const products = await transaction.apiProduct.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        active: true,
        scopes: true,
        organizationId: true,
      },
    });
    if (products.length !== productIds.length) {
      throw new ApplicationManagementError(
        'product_not_found',
        'One or more API products do not exist',
      );
    }
    const productsById = new Map(products.map(product => [product.id, product]));
    const grants = input.products.map(requested => {
      const product = productsById.get(requested.productId)!;
      if (!product.active) {
        throw new ApplicationManagementError(
          'product_not_active',
          `API product ${product.id} is not active`,
        );
      }
      if (product.organizationId !== app.organizationId) {
        throw new ApplicationManagementError(
          'organization_mismatch',
          `API product ${product.id} belongs to another organization`,
        );
      }
      const scopes = [...new Set(requested.scopes ?? product.scopes)];
      const unsupported = scopes.filter(scope => !product.scopes.includes(scope));
      if (unsupported.length > 0) {
        throw new ApplicationManagementError(
          'invalid_scope',
          `API product ${product.id} does not declare scopes: ${unsupported.join(', ')}`,
        );
      }
      return {
        productId: product.id,
        status: AuthorizationStatus.approved,
        scopes,
      };
    });
    const created = await transaction.appCredential.create({
      data: {
        appId: input.appId,
        consumerKey,
        consumerSecretHash,
        expiresAt: input.expiresAt,
        status: AuthorizationStatus.approved,
        productGrants: { create: grants },
      },
      select: {
        id: true,
        appId: true,
        consumerKey: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
        productGrants: {
          orderBy: { productId: 'asc' },
          select: {
            id: true,
            productId: true,
            status: true,
            scopes: true,
          },
        },
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: app.organizationId,
        action: 'credential.create',
        resourceType: 'AppCredential',
        resourceId: created.id,
        metadata: { appId: input.appId, productIds },
      },
    });
    return created;
  });
  return { credential, consumerSecret };
}
