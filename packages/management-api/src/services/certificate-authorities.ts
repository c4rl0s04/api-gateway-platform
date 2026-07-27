import {
  AdminRole,
  CertificateAuthorityKind,
  CertificateAuthorityStatus,
  prisma,
} from '@api-gateway/database';
import {
  EncryptedFileKeyStore,
  buildTrustBundle,
  createManagedAuthority,
  downloadExternalCertificateRevocationList,
  generateCertificateRevocationList,
  inspectCertificate,
  loadOrCreateMasterKey,
  validateCertificateRevocationList,
  type KeyStore,
} from '@api-gateway/pki';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AdminPrincipal } from '../auth/authorization.js';
import type { ManagementEnv } from '../config/env.js';

export interface CreateManagedAuthorityInput {
  organizationId: string;
  name: string;
  validityDays?: number;
}

export interface ImportExternalAuthorityInput {
  organizationId: string;
  name: string;
  certificatePem: string;
  chainPem?: string | null;
  crlDistributionUrl?: string | null;
}

export interface CertificateAuthorityOperations {
  list(organizationId: string): Promise<unknown>;
  createManaged(
    input: CreateManagedAuthorityInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  importExternal(
    input: ImportExternalAuthorityInput,
    actor: AdminPrincipal,
  ): Promise<unknown>;
  setStatus(
    id: string,
    status: 'active' | 'retiring' | 'revoked',
    actor: AdminPrincipal,
  ): Promise<unknown>;
  rotate(id: string, actor: AdminPrincipal): Promise<unknown>;
  refreshCrl(id: string, actor: AdminPrincipal): Promise<unknown>;
  uploadCrl(id: string, crlPem: string, actor: AdminPrincipal): Promise<unknown>;
}

function actorRole(principal: AdminPrincipal): AdminRole {
  return principal.memberships.find(membership =>
    membership.role === AdminRole.platformAdmin)?.role
    ?? principal.memberships[0]!.role;
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode: 0o644 });
  await rename(temporary, file);
}

export class CertificateAuthorityService
implements CertificateAuthorityOperations {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly trustBundleFile: string,
    private readonly crlBundleFile: string,
  ) {}

  list(organizationId: string) {
    return prisma.certificateAuthority.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        organizationId: true,
        name: true,
        kind: true,
        status: true,
        isDefaultIssuer: true,
        certificatePem: true,
        chainPem: true,
        fingerprintSha256: true,
        subject: true,
        serialNumber: true,
        validFrom: true,
        expiresAt: true,
        crlThisUpdate: true,
        crlNextUpdate: true,
        crlDistributionUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createManaged(
    input: CreateManagedAuthorityInput,
    actor: AdminPrincipal,
  ) {
    await prisma.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { id: true },
    });
    const id = randomUUID();
    const material = await createManagedAuthority({
      commonName: `gateway-${input.organizationId}-${id}`,
      validityDays: input.validityDays,
    });
    const keyRef = `authorities/${id}`;
    await this.keyStore.put(keyRef, material.privateKeyPem);
    try {
      const crl = await generateCertificateRevocationList({
        authorityCertificatePem: material.certificatePem,
        authorityPrivateKeyPem: material.privateKeyPem,
        revokedCertificates: [],
      });
      const authority = await prisma.$transaction(async transaction => {
        const created = await transaction.certificateAuthority.create({
          data: {
            id,
            organizationId: input.organizationId,
            name: input.name,
            kind: CertificateAuthorityKind.managed,
            status: CertificateAuthorityStatus.draft,
            certificatePem: material.certificatePem,
            fingerprintSha256: material.fingerprintSha256,
            subject: material.subject,
            serialNumber: material.serialNumber,
            validFrom: material.validFrom,
            expiresAt: material.expiresAt,
            keyRef,
            crlPem: crl.pem,
            crlThisUpdate: crl.lastUpdate,
            crlNextUpdate: crl.nextUpdate,
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorIssuer: actor.issuer,
            actorSubject: actor.subject,
            actorRole: actorRole(actor),
            organizationId: input.organizationId,
            action: 'certificateAuthority.createManaged',
            resourceType: 'CertificateAuthority',
            resourceId: created.id,
            metadata: { name: input.name },
          },
        });
        return created;
      });
      return authority;
    } catch (error) {
      await this.keyStore.delete(keyRef);
      throw error;
    }
  }

  async importExternal(
    input: ImportExternalAuthorityInput,
    actor: AdminPrincipal,
  ) {
    const metadata = inspectCertificate(input.certificatePem);
    if (!metadata.isCertificateAuthority) {
      throw new Error('External certificate must be a certificate authority');
    }
    const now = new Date();
    if (metadata.validFrom > now || metadata.expiresAt <= now) {
      throw new Error('External certificate authority is not currently valid');
    }
    if (
      input.crlDistributionUrl
      && new URL(input.crlDistributionUrl).protocol !== 'https:'
    ) {
      throw new Error('External CRL URL must use HTTPS');
    }
    return prisma.$transaction(async transaction => {
      const authority = await transaction.certificateAuthority.create({
        data: {
          organizationId: input.organizationId,
          name: input.name,
          kind: CertificateAuthorityKind.external,
          status: CertificateAuthorityStatus.draft,
          certificatePem: metadata.certificatePem,
          chainPem: input.chainPem,
          fingerprintSha256: metadata.fingerprintSha256,
          subject: metadata.subject,
          serialNumber: metadata.serialNumber,
          validFrom: metadata.validFrom,
          expiresAt: metadata.expiresAt,
          crlDistributionUrl: input.crlDistributionUrl,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: actorRole(actor),
          organizationId: input.organizationId,
          action: 'certificateAuthority.importExternal',
          resourceType: 'CertificateAuthority',
          resourceId: authority.id,
          metadata: { name: input.name },
        },
      });
      return authority;
    });
  }

  async setStatus(
    id: string,
    status: 'active' | 'retiring' | 'revoked',
    actor: AdminPrincipal,
  ) {
    const current = await prisma.certificateAuthority.findUniqueOrThrow({
      where: { id },
    });
    if (
      status === 'active'
      && (current.validFrom > new Date() || current.expiresAt <= new Date())
    ) {
      throw new Error('An authority outside its validity period cannot be activated');
    }
    const authority = await prisma.$transaction(async transaction => {
      if (status === 'active' && current.kind === 'managed') {
        await transaction.certificateAuthority.updateMany({
          where: {
            organizationId: current.organizationId,
            isDefaultIssuer: true,
          },
          data: { isDefaultIssuer: false },
        });
      }
      const updated = await transaction.certificateAuthority.update({
        where: { id },
        data: {
          status,
          isDefaultIssuer: status === 'active'
            && current.kind === 'managed',
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: actorRole(actor),
          organizationId: current.organizationId,
          action: `certificateAuthority.${status}`,
          resourceType: 'CertificateAuthority',
          resourceId: id,
          metadata: {},
        },
      });
      return updated;
    });
    await this.publishRuntimeTrust();
    return authority;
  }

  async rotate(id: string, actor: AdminPrincipal) {
    const current = await prisma.certificateAuthority.findUniqueOrThrow({
      where: { id },
    });
    if (current.kind !== CertificateAuthorityKind.managed) {
      throw new Error('Only managed authorities can be rotated by the platform');
    }
    const replacement = await this.createManaged({
      organizationId: current.organizationId,
      name: `${current.name} rotation`,
    }, actor) as { id: string };
    await this.setStatus(replacement.id, 'active', actor);
    await this.setStatus(current.id, 'retiring', actor);
    return prisma.certificateAuthority.findUniqueOrThrow({
      where: { id: replacement.id },
    });
  }

  async refreshCrl(id: string, actor: AdminPrincipal) {
    const authority = await prisma.certificateAuthority.findUniqueOrThrow({
      where: { id },
      include: {
        certificates: {
          where: {
            status: 'revoked',
            serialNumber: { not: null },
            expiresAt: { not: null },
            revokedAt: { not: null },
          },
        },
      },
    });
    const crl = authority.kind === CertificateAuthorityKind.managed
      ? await generateCertificateRevocationList({
          authorityCertificatePem: authority.certificatePem,
          authorityPrivateKeyPem: await this.keyStore.get(authority.keyRef!),
          revokedCertificates: authority.certificates.map(certificate => ({
            serialNumber: certificate.serialNumber!,
            expiresAt: certificate.expiresAt!,
            revokedAt: certificate.revokedAt!,
            reason: certificate.revocationReason === 'keyCompromise'
              ? 'keyCompromise'
              : 'unspecified',
          })),
        })
      : await downloadExternalCertificateRevocationList({
          url: authority.crlDistributionUrl
            ?? (() => {
              throw new Error('External authority has no CRL distribution URL');
            })(),
          authorityCertificatePem: authority.certificatePem,
        });
    const updated = await prisma.$transaction(async transaction => {
      const saved = await transaction.certificateAuthority.update({
        where: { id },
        data: {
          crlPem: crl.pem,
          crlThisUpdate: crl.lastUpdate,
          crlNextUpdate: crl.nextUpdate,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: actorRole(actor),
          organizationId: authority.organizationId,
          action: 'certificateAuthority.refreshCrl',
          resourceType: 'CertificateAuthority',
          resourceId: id,
          metadata: { nextUpdate: crl.nextUpdate.toISOString() },
        },
      });
      return saved;
    });
    if (['active', 'retiring'].includes(updated.status)) {
      await this.publishRuntimeTrust();
    }
    return updated;
  }

  async uploadCrl(id: string, crlPem: string, actor: AdminPrincipal) {
    const authority = await prisma.certificateAuthority.findUniqueOrThrow({
      where: { id },
    });
    if (authority.kind !== CertificateAuthorityKind.external) {
      throw new Error('Manual CRL upload is only valid for external authorities');
    }
    const crl = await validateCertificateRevocationList({
      crl: crlPem,
      authorityCertificatePem: authority.certificatePem,
    });
    const updated = await prisma.$transaction(async transaction => {
      const saved = await transaction.certificateAuthority.update({
        where: { id },
        data: {
          crlPem: crl.pem,
          crlThisUpdate: crl.lastUpdate,
          crlNextUpdate: crl.nextUpdate,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorIssuer: actor.issuer,
          actorSubject: actor.subject,
          actorRole: actorRole(actor),
          organizationId: authority.organizationId,
          action: 'certificateAuthority.uploadCrl',
          resourceType: 'CertificateAuthority',
          resourceId: id,
          metadata: { nextUpdate: crl.nextUpdate.toISOString() },
        },
      });
      return saved;
    });
    if (['active', 'retiring'].includes(updated.status)) {
      await this.publishRuntimeTrust();
    }
    return updated;
  }

  async publishRuntimeTrust(): Promise<void> {
    const authorities = await prisma.certificateAuthority.findMany({
      where: {
        status: {
          in: [
            CertificateAuthorityStatus.active,
            CertificateAuthorityStatus.retiring,
          ],
        },
      },
    });
    const bundles = buildTrustBundle(authorities.map(authority => ({
      id: authority.id,
      certificatePem: authority.certificatePem,
      status: authority.status as 'active' | 'retiring',
      crlPem: authority.crlPem,
      crlNextUpdate: authority.crlNextUpdate,
    })));
    await Promise.all([
      atomicWrite(this.trustBundleFile, bundles.caBundlePem),
      atomicWrite(this.crlBundleFile, bundles.crlBundlePem),
    ]);
  }
}

export async function createCertificateAuthorityService(
  config: ManagementEnv,
): Promise<CertificateAuthorityService> {
  const masterKey = await loadOrCreateMasterKey(config.PKI_MASTER_KEY_FILE);
  const keyStore = new EncryptedFileKeyStore(
    config.PKI_KEYSTORE_DIR,
    masterKey,
  );
  return new CertificateAuthorityService(
    keyStore,
    config.PKI_TRUST_BUNDLE_FILE,
    config.PKI_CRL_BUNDLE_FILE,
  );
}
