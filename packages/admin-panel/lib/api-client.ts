export async function managementFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/management/${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      message?: string;
      error?: string;
    };
    throw new Error(body.message ?? body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export interface Organization {
  id: string;
  name: string;
}

export interface AppCredential {
  id: string;
  consumerKey: string;
  authMethods: string[];
  status: string;
  expiresAt: string | null;
  certificates: Array<{
    id: string;
    fingerprintSha256: string;
    status: string;
    validFrom: string;
    expiresAt: string | null;
  }>;
  productGrants: Array<{
    id: string;
    status: string;
    scopes: string[];
    product: { id: string; name: string };
  }>;
}

export interface DeveloperApp {
  id: string;
  name: string;
  status: string;
  credentials: AppCredential[];
}

export interface CertificateRecord {
  id: string;
  fingerprintSha256: string;
  source: string;
  serialNumber: string | null;
  subject: string | null;
  issuer: string | null;
  status: string;
  validFrom: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  authority: {
    id: string;
    name: string;
    kind: string;
    status: string;
  } | null;
  credential: {
    id: string;
    consumerKey: string;
    app: { id: string; name: string };
  };
}
