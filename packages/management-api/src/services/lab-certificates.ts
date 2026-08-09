import type { LabPrincipal } from '@api-gateway/database';
import type { CertificateOperations } from './certificates.js';
import { resolveLabRequestContext } from './lab-context.js';

export interface LabCertificateOperations {
  list(principal: LabPrincipal): Promise<unknown>;
  issue(
    credentialId: string,
    input: { csrPem: string; validityDays?: number },
    principal: LabPrincipal,
  ): Promise<unknown>;
  download(certificateId: string, principal: LabPrincipal): Promise<unknown>;
  revoke(certificateId: string, reason: string, principal: LabPrincipal): Promise<unknown>;
}

export class LabCertificateService implements LabCertificateOperations {
  constructor(private readonly certificates: CertificateOperations) {}

  async list(principal: LabPrincipal) {
    const { workspace, actor } = await resolveLabRequestContext(principal);
    return this.certificates.list(workspace.organizationId, actor);
  }

  async issue(
    credentialId: string,
    input: { csrPem: string; validityDays?: number },
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.certificates.issue({
      credentialId,
      csrPem: input.csrPem,
      validityDays: Math.min(input.validityDays ?? 1, 1),
    }, actor);
  }

  async download(certificateId: string, principal: LabPrincipal) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.certificates.download(certificateId, actor);
  }

  async revoke(
    certificateId: string,
    reason: string,
    principal: LabPrincipal,
  ) {
    const { actor } = await resolveLabRequestContext(principal);
    return this.certificates.revoke(certificateId, reason, actor);
  }
}
