import {
  AdminRole,
  AuthorizationStatus,
  CertificateAuthorityKind,
  CertificateSource,
  prisma,
} from '@api-gateway/database';
import {
  issueClientCertificate,
  validateExternalClientCertificate,
  type KeyStore,
} from '@api-gateway/pki';
import { createHash, randomUUID } from 'node:crypto';
import { canManageOrganization, canReadOrganization, type AdminPrincipal } from '../auth/authorization.js';
import type { CertificateAuthorityService } from './certificate-authorities.js';

export interface CertificateOperations {
  list(organizationId: string, actor: AdminPrincipal): Promise<unknown>;
  issue(
    input: {
      credentialId: string;
      csrPem: string;
      authorityId?: string;
      validityDays?: number;
    },
    actor: AdminPrincipal,
  ): Promise<unknown>;
  registerExternal(
    input: {
      credentialId: string;
      authorityId: string;
      certificatePem: string;
      chainPem?: string | null;
    },
    actor: AdminPrincipal,
  ): Promise<unknown>;
  download(id: string, actor: AdminPrincipal): Promise<{
    certificatePem: string;
    chainPem: string | null;
  }>;
  revoke(
    id: string,
    reason: string,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  status(actor: AdminPrincipal): Promise<unknown>;
}

function principalRole(principal: AdminPrincipal): AdminRole {
  return principal.memberships.find(membership =>
    membership.role === AdminRole.platformAdmin)?.role
    ?? principal.memberships[0]!.role;
}

function requireRead(principal: AdminPrincipal, organizationId: string): void {
  if (!canReadOrganization(principal, organizationId)) {
    const error = new Error('Organization access denied');
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
}

function requireManage(principal: AdminPrincipal, organizationId: string): void {
  if (!canManageOrganization(principal, organizationId)) {
    const error = new Error('Organization administration access denied');
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
}

export class CertificateService implements CertificateOperations {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly authorities: CertificateAuthorityService,
  ) {}

  async list(organizationId: string, actor: AdminPrincipal) {
    requireRead(actor, organizationId);
    return prisma.appCertificate.findMany({
      where: {
        credential: { app: { organizationId } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        authority: {
          select: { id: true, name: true, kind: true, status: true },
        },
        credential: {
          select: {
            id: true,
            consumerKey: true,
            app: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async issue(
    input: {
      credentialId: string;
      csrPem: string;
      authorityId?: string;
      validityDays?: number;
    },
    actor: AdminPrincipal,
  ) {
    const credential = await prisma.appCredential.findUniqueOrThrow({
      where: { id: input.credentialId },
      include: { app: true },
    });
    requireManage(actor, credential.app.organizationId);
    const authority = await prisma.certificateAuthority.findFirstOrThrow({
      where: {
        id: input.authorityId,
        organizationId: credential.app.organizationId,
        kind: CertificateAuthorityKind.managed,
        status: 'active',
        ...(input.authorityId
          ? {}
          : { isDefaultIssuer: true }),
      },
    });
    if (!authority.keyRef) {
      throw new Error('Managed authority has no private key reference');
    }
    const issuanceId = randomUUID();
    const csrSha256 = createHash('sha256')
      .update(input.csrPem)
      .digest('hex');
    await prisma.certificateIssuance.create({
      data: {
        id: issuanceId,
        authorityId: authority.id,
        credentialId: credential.id,
        csrSha256,
        requestedDays: input.validityDays ?? 90,
      },
    });
    try {
      const material = await issueClientCertificate({
        csrPem: input.csrPem,
        authorityCertificatePem: authority.certificatePem,
        authorityPrivateKeyPem: await this.keyStore.get(authority.keyRef),
        organizationId: credential.app.organizationId,
        appId: credential.appId,
        credentialId: credential.id,
        validityDays: input.validityDays,
      });
      return prisma.$transaction(async transaction => {
        const certificate = await transaction.appCertificate.create({
          data: {
            credentialId: credential.id,
            authorityId: authority.id,
            fingerprintSha256: material.fingerprintSha256,
            certificatePem: material.certificatePem,
            source: CertificateSource.managed,
            serialNumber: material.serialNumber,
            subject: material.subject,
            issuer: material.issuer,
            status: AuthorizationStatus.approved,
            validFrom: material.validFrom,
            expiresAt: material.expiresAt,
          },
        });
        await transaction.certificateIssuance.update({
          where: { id: issuanceId },
          data: {
            certificateId: certificate.id,
            completedAt: new Date(),
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorIssuer: actor.issuer,
            actorSubject: actor.subject,
            actorRole: principalRole(actor),
            organizationId: credential.app.organizationId,
            action: 'certificate.issue',
            resourceType: 'AppCertificate',
            resourceId: certificate.id,
            metadata: {
              credentialId: credential.id,
              authorityId: authority.id,
            },
          },
        });
        return certificate;
      });
    } catch (error) {
      await prisma.certificateIssuance.update({
        where: { id: issuanceId },
        data: {
          errorCode: 'ISSUANCE_FAILED',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async registerExternal(
    input: {
      credentialId: string;
      authorityId: string;
      certificatePem: string;
      chainPem?: string | null;
    },
    actor: AdminPrincipal,
  ) {
    const credential = await prisma.appCredential.findUniqueOrThrow({
      where: { id: input.credentialId },
      include: { app: true },
    });
    requireManage(actor, credential.app.organizationId);
    const authority = await prisma.certificateAuthority.findFirstOrThrow({
      where: {
        id: input.authorityId,
        organizationId: credential.app.organizationId,
        status: { in: ['active', 'retiring'] },
      },
    });
    const material = await validateExternalClientCertificate({
      certificatePem: input.certificatePem,
      authorityCertificatePem: authority.certificatePem,
      chainPem: input.chainPem,
    });
    return prisma.$transaction(async transaction => {
      const certificate = await transaction.appCertificate.create({
        data: {
          credentialId: credential.id,
          authorityId: authority.id,
          fingerprintSha256: material.fingerprintSha256,
          certificatePem: material.certificatePem,
          chainPem: input.chainPem,
          source: CertificateSource.external,
          serialNumber: material.serialNumber,
          subject: material.subject,
          issuer: material.issuer,
          status: AuthorizationStatus.approved,
          validFrom: material.validFrom,
          expiresAt: material.expiresAt,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: principalRole(actor),
          organizationId: credential.app.organizationId,
          action: 'certificate.registerExternal',
          resourceType: 'AppCertificate',
          resourceId: certificate.id,
          metadata: {
            credentialId: credential.id,
            authorityId: authority.id,
          },
        },
      });
      return certificate;
    });
  }

  async download(id: string, actor: AdminPrincipal) {
    const certificate = await prisma.appCertificate.findUniqueOrThrow({
      where: { id },
      include: { credential: { include: { app: true } } },
    });
    requireRead(actor, certificate.credential.app.organizationId);
    if (!certificate.certificatePem) {
      throw new Error('Certificate public material is unavailable');
    }
    return {
      certificatePem: certificate.certificatePem,
      chainPem: certificate.chainPem,
    };
  }

  async revoke(id: string, reason: string, actor: AdminPrincipal) {
    const certificate = await prisma.appCertificate.findUniqueOrThrow({
      where: { id },
      include: { credential: { include: { app: true } } },
    });
    requireManage(actor, certificate.credential.app.organizationId);
    const revoked = await prisma.$transaction(async transaction => {
      const updated = await transaction.appCertificate.update({
        where: { id },
        data: {
          status: AuthorizationStatus.revoked,
          revokedAt: new Date(),
          revocationReason: reason,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: principalRole(actor),
          organizationId: certificate.credential.app.organizationId,
          action: 'certificate.revoke',
          resourceType: 'AppCertificate',
          resourceId: id,
          metadata: { reason },
        },
      });
      return updated;
    });
    if (certificate.authorityId) {
      await this.authorities.refreshCrl(certificate.authorityId, actor);
    }
    return revoked;
  }

  async status(actor: AdminPrincipal) {
    const organizationIds = actor.memberships
      .map(membership => membership.organizationId)
      .filter((value): value is string => Boolean(value));
    const platformAdmin = actor.memberships.some(membership =>
      membership.role === AdminRole.platformAdmin);
    const organizationFilter = platformAdmin
      ? {}
      : { organizationId: { in: organizationIds } };
    const [authorities, expiringCertificates, recentAudit] = await Promise.all([
      prisma.certificateAuthority.findMany({
        where: organizationFilter,
        select: {
          id: true,
          organizationId: true,
          name: true,
          status: true,
          expiresAt: true,
          crlNextUpdate: true,
        },
      }),
      prisma.appCertificate.count({
        where: {
          credential: { app: organizationFilter },
          status: AuthorizationStatus.approved,
          expiresAt: {
            lte: new Date(Date.now() + 30 * 86_400_000),
            gt: new Date(),
          },
        },
      }),
      prisma.auditEvent.findMany({
        where: platformAdmin
          ? {}
          : { organizationId: { in: organizationIds } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return { authorities, expiringCertificates, recentAudit };
  }
}
