import {
  AdminRole,
  AuthorizationStatus,
  CredentialPurpose,
  Prisma,
  PublicKeyAlgorithm,
} from './generated/index.js';
import { prisma } from './client.js';
import {
  generateConsumerKey,
  generateConsumerSecret,
  hashConsumerSecret,
  validateRsaJwk,
} from './credentials.js';

export type ApplicationManagementErrorCode =
  | 'invalid_request'
  | 'app_not_found'
  | 'credential_not_found'
  | 'product_not_found'
  | 'product_not_active'
  | 'organization_mismatch'
  | 'invalid_scope'
  | 'invalid_status_transition'
  | 'consumer_key_conflict'
  | 'credential_clone_not_allowed'
  | 'invalid_credential_expiration'
  | 'public_key_not_found'
  | 'public_key_conflict';

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

export interface UpdateManagedCredentialInput {
  credentialId: string;
  consumerKey?: string;
  expiresAt?: Date | null;
  status?: AuthorizationStatus;
  actor: ApplicationMutationActor;
}

export async function updateManagedCredential(
  input: UpdateManagedCredentialInput,
) {
  const consumerKey = input.consumerKey === undefined
    ? undefined
    : normalizeManagedConsumerKey(input.consumerKey);
  try {
    return await prisma.$transaction(async transaction => {
    const current = await transaction.appCredential.findUnique({
      where: { id: input.credentialId },
      select: {
        id: true,
        consumerKey: true,
        status: true,
        expiresAt: true,
        appId: true,
        app: { select: { organizationId: true } },
      },
    });
    if (!current) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    if (input.status) validateStatusTransition(current.status, input.status);
    const credential = await transaction.appCredential.update({
      where: { id: input.credentialId },
      data: {
        consumerKey,
        expiresAt: input.expiresAt,
        status: input.status,
      },
      select: {
        id: true,
        appId: true,
        consumerKey: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (input.expiresAt !== undefined || input.status !== undefined) {
      await transaction.auditEvent.create({
        data: {
          actorIssuer: input.actor.issuer,
          actorSubject: input.actor.subject,
          actorRole: input.actor.role,
          organizationId: current.app.organizationId,
          action: 'credential.update',
          resourceType: 'AppCredential',
          resourceId: input.credentialId,
          metadata: {
            appId: current.appId,
            changedFields: [
              ...(input.expiresAt !== undefined ? ['expiresAt'] : []),
              ...(input.status !== undefined ? ['status'] : []),
            ],
            previousStatus: current.status,
            previousExpiresAt: current.expiresAt?.toISOString() ?? null,
          },
        },
      });
    }
    if (consumerKey !== undefined && consumerKey !== current.consumerKey) {
      await transaction.auditEvent.create({
        data: {
          actorIssuer: input.actor.issuer,
          actorSubject: input.actor.subject,
          actorRole: input.actor.role,
          organizationId: current.app.organizationId,
          action: 'credential.updateConsumerKey',
          resourceType: 'AppCredential',
          resourceId: input.credentialId,
          metadata: {
            appId: current.appId,
            previousConsumerKey: current.consumerKey,
            consumerKey,
          },
        },
      });
    }
    return credential;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002') {
      throw new ApplicationManagementError(
        'consumer_key_conflict',
        'The consumer key is already assigned to another credential',
      );
    }
    throw error;
  }
}

function normalizeManagedConsumerKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > 120
    || /[\s:\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new ApplicationManagementError(
      'invalid_request',
      'Consumer keys must contain 1-120 non-whitespace characters and cannot contain colons',
    );
  }
  return normalized;
}

export interface CloneManagedCredentialInput {
  appId: string;
  sourceCredentialId: string;
  purpose?: CredentialPurpose;
  expiresAt?: Date;
  actor: ApplicationMutationActor;
}

export async function cloneManagedCredential(
  input: CloneManagedCredentialInput,
) {
  const consumerKey = generateConsumerKey();
  const consumerSecret = generateConsumerSecret();
  const consumerSecretHash = await hashConsumerSecret(consumerSecret);
  const credential = await prisma.$transaction(async transaction => {
    const now = new Date();
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
    const source = await transaction.appCredential.findUnique({
      where: { id: input.sourceCredentialId },
      select: {
        id: true,
        appId: true,
        status: true,
        expiresAt: true,
        productGrants: {
          where: { status: AuthorizationStatus.approved },
          select: { productId: true, scopes: true },
        },
      },
    });
    if (!source) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Source application credential does not exist',
      );
    }
    if (
      source.appId !== input.appId
      || source.status === AuthorizationStatus.revoked
      || app.status === AuthorizationStatus.revoked
      || source.expiresAt !== null && source.expiresAt <= now
      || source.productGrants.length === 0
    ) {
      throw new ApplicationManagementError(
        'credential_clone_not_allowed',
        'Only a non-revoked credential from the same app with approved grants can be cloned',
      );
    }
    const purpose = input.purpose ?? CredentialPurpose.standard;
    const expiresAt = resolveCloneExpiration({
      purpose,
      requestedExpiresAt: input.expiresAt,
      sourceExpiresAt: source.expiresAt,
      now,
    });
    const created = await transaction.appCredential.create({
      data: {
        appId: input.appId,
        consumerKey,
        consumerSecretHash,
        purpose,
        expiresAt,
        status: AuthorizationStatus.approved,
        productGrants: {
          create: source.productGrants.map(grant => ({
            productId: grant.productId,
            status: AuthorizationStatus.approved,
            scopes: grant.scopes,
          })),
        },
      },
      select: {
        id: true,
        appId: true,
        consumerKey: true,
        purpose: true,
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
        action: 'credential.clone',
        resourceType: 'AppCredential',
        resourceId: created.id,
        metadata: {
          appId: input.appId,
          sourceCredentialId: source.id,
          purpose,
          expiresAt: expiresAt?.toISOString() ?? null,
          productIds: source.productGrants.map(grant => grant.productId),
        },
      },
    });
    return created;
  });
  return { credential, consumerSecret };
}

function resolveCloneExpiration(input: {
  purpose: CredentialPurpose;
  requestedExpiresAt?: Date;
  sourceExpiresAt: Date | null;
  now: Date;
}): Date | null {
  if (input.purpose !== CredentialPurpose.playground) {
    if (input.requestedExpiresAt !== undefined) {
      throw new ApplicationManagementError(
        'invalid_credential_expiration',
        'A custom clone expiration is only supported for playground credentials',
      );
    }
    return input.sourceExpiresAt;
  }

  const maximum = new Date(input.now.getTime() + 60 * 60 * 1000);
  const latestAllowed = input.sourceExpiresAt !== null
    && input.sourceExpiresAt < maximum
    ? input.sourceExpiresAt
    : maximum;
  const expiresAt = input.requestedExpiresAt ?? latestAllowed;
  if (expiresAt <= input.now || expiresAt > latestAllowed) {
    throw new ApplicationManagementError(
      'invalid_credential_expiration',
      'Playground credentials must expire within one hour and before their source credential',
    );
  }
  return expiresAt;
}

export interface RotateManagedConsumerSecretInput {
  credentialId: string;
  actor: ApplicationMutationActor;
}

export async function rotateManagedConsumerSecret(
  input: RotateManagedConsumerSecretInput,
) {
  const consumerSecret = generateConsumerSecret();
  const consumerSecretHash = await hashConsumerSecret(consumerSecret);
  await prisma.$transaction(async transaction => {
    const credential = await transaction.appCredential.findUnique({
      where: { id: input.credentialId },
      select: {
        id: true,
        appId: true,
        status: true,
        app: { select: { organizationId: true, status: true } },
      },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    if (
      credential.status === AuthorizationStatus.revoked
      || credential.app.status === AuthorizationStatus.revoked
    ) {
      throw new ApplicationManagementError(
        'invalid_status_transition',
        'Cannot rotate a secret for a revoked credential or application',
      );
    }
    await transaction.appCredential.update({
      where: { id: input.credentialId },
      data: { consumerSecretHash },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: credential.app.organizationId,
        action: 'credential.rotateSecret',
        resourceType: 'AppCredential',
        resourceId: input.credentialId,
        metadata: { appId: credential.appId },
      },
    });
  });
  return { consumerSecret };
}

export interface ReplaceManagedCredentialGrantsInput {
  credentialId: string;
  products: Array<{ productId: string; scopes?: string[] }>;
  actor: ApplicationMutationActor;
}

export async function replaceManagedCredentialGrants(
  input: ReplaceManagedCredentialGrantsInput,
) {
  const productIds = input.products.map(product => product.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new ApplicationManagementError(
      'product_not_found',
      'Product grants must use unique product IDs',
    );
  }
  return prisma.$transaction(async transaction => {
    const credential = await transaction.appCredential.findUnique({
      where: { id: input.credentialId },
      select: {
        id: true,
        appId: true,
        status: true,
        app: { select: { organizationId: true, status: true } },
        productGrants: { select: { productId: true, status: true } },
      },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    if (
      credential.status === AuthorizationStatus.revoked
      || credential.app.status === AuthorizationStatus.revoked
    ) {
      throw new ApplicationManagementError(
        'invalid_status_transition',
        'Cannot change grants for a revoked credential or application',
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
    for (const requested of input.products) {
      const product = productsById.get(requested.productId)!;
      if (!product.active) {
        throw new ApplicationManagementError(
          'product_not_active',
          `API product ${product.id} is not active`,
        );
      }
      if (product.organizationId !== credential.app.organizationId) {
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
      await transaction.credentialProductGrant.upsert({
        where: {
          credentialId_productId: {
            credentialId: input.credentialId,
            productId: product.id,
          },
        },
        create: {
          credentialId: input.credentialId,
          productId: product.id,
          status: AuthorizationStatus.approved,
          scopes,
        },
        update: { status: AuthorizationStatus.approved, scopes },
      });
    }
    const revokedProductIds = credential.productGrants
      .filter(grant => !productIds.includes(grant.productId)
        && grant.status !== AuthorizationStatus.revoked)
      .map(grant => grant.productId);
    if (revokedProductIds.length > 0) {
      await transaction.credentialProductGrant.updateMany({
        where: {
          credentialId: input.credentialId,
          productId: { in: revokedProductIds },
        },
        data: { status: AuthorizationStatus.revoked },
      });
    }
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: credential.app.organizationId,
        action: 'credential.replaceProductGrants',
        resourceType: 'AppCredential',
        resourceId: input.credentialId,
        metadata: {
          appId: credential.appId,
          approvedProductIds: productIds,
          revokedProductIds,
        },
      },
    });
    return transaction.credentialProductGrant.findMany({
      where: { credentialId: input.credentialId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        productId: true,
        status: true,
        scopes: true,
        createdAt: true,
        updatedAt: true,
        product: { select: { name: true, active: true, scopes: true } },
      },
    });
  });
}

export interface RegisterManagedPublicKeyInput {
  credentialId: string;
  kid: string;
  jwk: Prisma.InputJsonObject;
  validFrom?: Date;
  expiresAt?: Date | null;
  actor: ApplicationMutationActor;
}

export async function registerManagedPublicKey(
  input: RegisterManagedPublicKeyInput,
) {
  validateRsaJwk(input.jwk);
  try {
    return await prisma.$transaction(async transaction => {
      const credential = await transaction.appCredential.findUnique({
        where: { id: input.credentialId },
        select: {
          id: true,
          appId: true,
          status: true,
          app: { select: { organizationId: true, status: true } },
        },
      });
      if (!credential) {
        throw new ApplicationManagementError(
          'credential_not_found',
          'Application credential does not exist',
        );
      }
      if (
        credential.status === AuthorizationStatus.revoked
        || credential.app.status === AuthorizationStatus.revoked
      ) {
        throw new ApplicationManagementError(
          'invalid_status_transition',
          'Cannot register a key for a revoked credential or application',
        );
      }
      const publicKey = await transaction.appPublicKey.create({
        data: {
          credentialId: input.credentialId,
          kid: input.kid.trim(),
          jwk: input.jwk,
          algorithm: PublicKeyAlgorithm.RS256,
          validFrom: input.validFrom,
          expiresAt: input.expiresAt,
          status: AuthorizationStatus.approved,
        },
        select: {
          id: true,
          credentialId: true,
          kid: true,
          algorithm: true,
          jwk: true,
          status: true,
          validFrom: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: input.actor.issuer,
          actorSubject: input.actor.subject,
          actorRole: input.actor.role,
          organizationId: credential.app.organizationId,
          action: 'publicKey.register',
          resourceType: 'AppPublicKey',
          resourceId: publicKey.id,
          metadata: {
            appId: credential.appId,
            credentialId: input.credentialId,
            kid: publicKey.kid,
          },
        },
      });
      return publicKey;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2002') {
      throw new ApplicationManagementError(
        'public_key_conflict',
        'The credential already contains this public key ID',
      );
    }
    throw error;
  }
}

export interface RevokeManagedPublicKeyInput {
  publicKeyId: string;
  actor: ApplicationMutationActor;
}

export async function revokeManagedPublicKey(
  input: RevokeManagedPublicKeyInput,
) {
  return prisma.$transaction(async transaction => {
    const current = await transaction.appPublicKey.findUnique({
      where: { id: input.publicKeyId },
      select: {
        id: true,
        kid: true,
        status: true,
        credentialId: true,
        credential: {
          select: {
            appId: true,
            app: { select: { organizationId: true } },
          },
        },
      },
    });
    if (!current) {
      throw new ApplicationManagementError(
        'public_key_not_found',
        'Application public key does not exist',
      );
    }
    const publicKey = await transaction.appPublicKey.update({
      where: { id: input.publicKeyId },
      data: { status: AuthorizationStatus.revoked },
      select: {
        id: true,
        kid: true,
        status: true,
        credentialId: true,
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: current.credential.app.organizationId,
        action: 'publicKey.revoke',
        resourceType: 'AppPublicKey',
        resourceId: input.publicKeyId,
        metadata: {
          appId: current.credential.appId,
          credentialId: current.credentialId,
          kid: current.kid,
          alreadyRevoked: current.status === AuthorizationStatus.revoked,
        },
      },
    });
    return publicKey;
  });
}
