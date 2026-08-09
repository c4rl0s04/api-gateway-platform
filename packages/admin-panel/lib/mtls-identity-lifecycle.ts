export interface CertificateLifecycleRecord {
  status: string;
  expiresAt: string | null;
}

export type CertificateLifecycleState = 'active' | 'expired' | 'revoked' | 'missing';

export function createMtlsIdentityName(credentialId: string, nonce = crypto.randomUUID()): string {
  return `lab-${credentialId.slice(0, 8)}-${nonce.slice(0, 8)}`;
}

export function certificateState(
  certificate: CertificateLifecycleRecord | undefined,
  now = Date.now(),
): CertificateLifecycleState {
  if (!certificate) return 'missing';
  if (certificate.status === 'revoked') return 'revoked';
  if (certificate.status !== 'approved') return 'missing';
  if (certificate.expiresAt && new Date(certificate.expiresAt).getTime() <= now) {
    return 'expired';
  }
  return 'active';
}
