import {
  AdminRole,
  ApplicationManagementError,
  Prisma,
  createManagedCredential,
  prisma,
  registerDeveloperApplication,
  rotateManagedConsumerSecret,
  replaceManagedCredentialGrants,
  registerManagedPublicKey,
  revokeManagedPublicKey,
  updateDeveloperApplication,
  updateManagedCredential,
} from '@api-gateway/database';
import {
  canManageOrganization,
  canReadOrganization,
  isPlatformAdmin,
  type AdminPrincipal,
} from '../auth/authorization.js';

export interface RegisterApplicationInput {
  name: string;
  products: Array<{
    productId: string;
    scopes?: string[];
  }>;
}

export interface UpdateApplicationInput {
  name?: string;
  status?: 'pending' | 'approved' | 'revoked';
}

export interface CreateCredentialInput {
  expiresAt?: Date | null;
  products: Array<{ productId: string; scopes?: string[] }>;
}

export interface UpdateCredentialInput {
  expiresAt?: Date | null;
  status?: 'pending' | 'approved' | 'revoked';
}

export interface RegisterPublicKeyInput {
  kid: string;
  jwk: Prisma.InputJsonObject;
  validFrom?: Date;
  expiresAt?: Date | null;
}

export interface ApplicationOperations {
  list(organizationId: string, actor: AdminPrincipal): Promise<unknown>;
  get(appId: string, actor: AdminPrincipal): Promise<unknown>;
  register(
    organizationId: string,
    input: RegisterApplicationInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  update(
    appId: string,
    input: UpdateApplicationInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  createCredential(
    appId: string,
    input: CreateCredentialInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  getCredential(credentialId: string, actor: AdminPrincipal): Promise<unknown>;
  updateCredential(
    credentialId: string,
    input: UpdateCredentialInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  rotateCredential(
    credentialId: string,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  replaceCredentialGrants(
    credentialId: string,
    input: { products: Array<{ productId: string; scopes?: string[] }> },
    actor: AdminPrincipal,
  ): Promise<unknown>;
  listPublicKeys(
    credentialId: string,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  registerPublicKey(
    credentialId: string,
    input: RegisterPublicKeyInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  revokePublicKey(
    publicKeyId: string,
    actor: AdminPrincipal,
  ): Promise<unknown>;
}

function forbidden(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 403 });
}

function actorRole(
  principal: AdminPrincipal,
  organizationId: string,
): AdminRole {
  if (isPlatformAdmin(principal)) {
    return AdminRole.platformAdmin;
  }
  const membership = principal.memberships.find(candidate =>
    candidate.active
    && candidate.organizationId === organizationId
    && candidate.role === AdminRole.organizationAdmin);
  if (!membership) {
    throw forbidden('Organization administration access denied');
  }
  return membership.role;
}

const appSelection = {
  id: true,
  name: true,
  status: true,
  organizationId: true,
  createdAt: true,
  credentials: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      consumerKey: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      createdAt: true,
      productGrants: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          status: true,
          scopes: true,
          product: {
            select: {
              id: true,
              name: true,
              active: true,
            },
          },
        },
      },
      publicKeys: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          kid: true,
          algorithm: true,
          status: true,
          validFrom: true,
          expiresAt: true,
        },
      },
      certificates: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          fingerprintSha256: true,
          status: true,
          validFrom: true,
          expiresAt: true,
        },
      },
    },
  },
};

export class ApplicationService implements ApplicationOperations {
  async list(organizationId: string, actor: AdminPrincipal) {
    if (!canReadOrganization(actor, organizationId)) {
      throw forbidden('Organization access denied');
    }
    return prisma.developerApp.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: appSelection,
    });
  }

  async get(appId: string, actor: AdminPrincipal) {
    const app = await prisma.developerApp.findUnique({
      where: { id: appId },
      select: appSelection,
    });
    if (!app) {
      throw Object.assign(new Error('Application does not exist'), {
        statusCode: 404,
      });
    }
    if (!canReadOrganization(actor, app.organizationId)) {
      throw forbidden('Organization access denied');
    }
    return app;
  }

  async register(
    organizationId: string,
    input: RegisterApplicationInput,
    actor: AdminPrincipal,
  ) {
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return registerDeveloperApplication({
      organizationId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async update(
    appId: string,
    input: UpdateApplicationInput,
    actor: AdminPrincipal,
  ) {
    const app = await prisma.developerApp.findUnique({
      where: { id: appId },
      select: { organizationId: true },
    });
    if (!app) {
      throw new ApplicationManagementError(
        'app_not_found',
        'Developer application does not exist',
      );
    }
    if (!canManageOrganization(actor, app.organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return updateDeveloperApplication({
      appId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, app.organizationId),
      },
    });
  }

  async createCredential(
    appId: string,
    input: CreateCredentialInput,
    actor: AdminPrincipal,
  ) {
    const app = await prisma.developerApp.findUnique({
      where: { id: appId },
      select: { organizationId: true },
    });
    if (!app) {
      throw new ApplicationManagementError(
        'app_not_found',
        'Developer application does not exist',
      );
    }
    if (!canManageOrganization(actor, app.organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return createManagedCredential({
      appId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, app.organizationId),
      },
    });
  }

  async getCredential(credentialId: string, actor: AdminPrincipal) {
    const credential = await prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: {
        id: true,
        appId: true,
        consumerKey: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        app: { select: { id: true, name: true, organizationId: true } },
        productGrants: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            scopes: true,
            product: { select: { id: true, name: true, active: true } },
          },
        },
        publicKeys: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            kid: true,
            algorithm: true,
            status: true,
            validFrom: true,
            expiresAt: true,
          },
        },
        certificates: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fingerprintSha256: true,
            status: true,
            validFrom: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    if (!canReadOrganization(actor, credential.app.organizationId)) {
      throw forbidden('Organization access denied');
    }
    return credential;
  }

  async updateCredential(
    credentialId: string,
    input: UpdateCredentialInput,
    actor: AdminPrincipal,
  ) {
    const credential = await prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: { app: { select: { organizationId: true } } },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    const organizationId = credential.app.organizationId;
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return updateManagedCredential({
      credentialId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async rotateCredential(credentialId: string, actor: AdminPrincipal) {
    const credential = await prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: { app: { select: { organizationId: true } } },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    const organizationId = credential.app.organizationId;
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return rotateManagedConsumerSecret({
      credentialId,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async replaceCredentialGrants(
    credentialId: string,
    input: { products: Array<{ productId: string; scopes?: string[] }> },
    actor: AdminPrincipal,
  ) {
    const credential = await prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: { app: { select: { organizationId: true } } },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    const organizationId = credential.app.organizationId;
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return replaceManagedCredentialGrants({
      credentialId,
      products: input.products,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async listPublicKeys(credentialId: string, actor: AdminPrincipal) {
    const credential = await prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: { app: { select: { organizationId: true } } },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    if (!canReadOrganization(actor, credential.app.organizationId)) {
      throw forbidden('Organization access denied');
    }
    return prisma.appPublicKey.findMany({
      where: { credentialId },
      orderBy: { createdAt: 'asc' },
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
  }

  async registerPublicKey(
    credentialId: string,
    input: RegisterPublicKeyInput,
    actor: AdminPrincipal,
  ) {
    const credential = await prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: { app: { select: { organizationId: true } } },
    });
    if (!credential) {
      throw new ApplicationManagementError(
        'credential_not_found',
        'Application credential does not exist',
      );
    }
    const organizationId = credential.app.organizationId;
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return registerManagedPublicKey({
      credentialId,
      ...input,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }

  async revokePublicKey(publicKeyId: string, actor: AdminPrincipal) {
    const publicKey = await prisma.appPublicKey.findUnique({
      where: { id: publicKeyId },
      select: {
        credential: { select: { app: { select: { organizationId: true } } } },
      },
    });
    if (!publicKey) {
      throw new ApplicationManagementError(
        'public_key_not_found',
        'Application public key does not exist',
      );
    }
    const organizationId = publicKey.credential.app.organizationId;
    if (!canManageOrganization(actor, organizationId)) {
      throw forbidden('Organization administration access denied');
    }
    return revokeManagedPublicKey({
      publicKeyId,
      actor: {
        issuer: actor.issuer,
        subject: actor.subject,
        role: actorRole(actor, organizationId),
      },
    });
  }
}
