export type MtlsCertificateCompatibility =
  | 'authorized'
  | 'unregistered'
  | 'revoked'
  | 'expired'
  | 'not-active'
  | 'not-authorized';

interface LocalCertificateIdentity {
  hasCertificate: boolean;
  certificateFingerprintSha256?: string;
}

interface PlatformCertificate {
  fingerprintSha256: string;
  status: string;
  validFrom: string;
  expiresAt: string | null;
  credential: { id: string };
}

export function resolveMtlsCertificateCompatibility(
  identity: LocalCertificateIdentity,
  certificates: PlatformCertificate[],
  authorizedCredentialIds: Set<string>,
  now = Date.now(),
): { state: MtlsCertificateCompatibility; certificate?: PlatformCertificate } {
  const fingerprint = identity.certificateFingerprintSha256?.replaceAll(':', '').toLowerCase();
  const certificate = fingerprint
    ? certificates.find(candidate => candidate.fingerprintSha256.toLowerCase() === fingerprint)
    : undefined;
  if (!certificate) return { state: 'unregistered' };
  if (certificate.status === 'revoked') return { state: 'revoked', certificate };
  if (certificate.status !== 'approved' || new Date(certificate.validFrom).getTime() > now) {
    return { state: 'not-active', certificate };
  }
  if (certificate.expiresAt && new Date(certificate.expiresAt).getTime() <= now) {
    return { state: 'expired', certificate };
  }
  if (!authorizedCredentialIds.has(certificate.credential.id)) {
    return { state: 'not-authorized', certificate };
  }
  return { state: 'authorized', certificate };
}

export function mtlsCompatibilityLabel(state: MtlsCertificateCompatibility): string {
  switch (state) {
    case 'authorized': return 'Authorized for this proxy';
    case 'unregistered': return 'Not registered in this organization';
    case 'revoked': return 'Certificate revoked';
    case 'expired': return 'Certificate expired';
    case 'not-active': return 'Certificate is not active';
    case 'not-authorized': return 'Credential is not authorized for this proxy';
  }
}
