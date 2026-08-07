export class ManagementApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ManagementApiError';
  }
}

async function managementRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== 'undefined'
    && init?.body instanceof FormData;
  if (init?.body && !isFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`/api/management/${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      message?: string;
      error?: string;
      details?: unknown;
    };
    throw new ManagementApiError(
      body.message ?? body.error ?? `Request failed (${response.status})`,
      response.status,
      body.error,
      body.details,
    );
  }
  return response;
}

export async function managementFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await managementRequest(path, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function managementText(
  path: string,
  init?: RequestInit,
): Promise<{ content: string; contentType: string }> {
  const response = await managementRequest(path, init);
  return {
    content: await response.text(),
    contentType: response.headers.get('content-type') ?? 'text/plain',
  };
}

export interface Organization {
  id: string;
  name: string;
}

export type DeploymentStage = 'qual' | 'pprod' | 'prod';
export type DeploymentStatus = 'active' | 'retired';

export interface Environment {
  id: string;
  stage: DeploymentStage;
  region: string;
  publicOrigin: string;
  createdAt: string;
  _count: { deployments: number; products: number };
}

export interface ProxyRevisionSummary {
  id: string;
  proxyId: string;
  revisionNumber: number;
  basePath: string;
  openapiVersion: string;
  contentHash: string;
  createdAt: string;
  _count?: { operations: number; deployments: number };
}

export interface ProxyActiveDeployment {
  id: string;
  environmentId: string;
  revisionId: string;
  status: DeploymentStatus;
}

export interface ApiProxySummary {
  id: string;
  name: string;
  active: boolean;
  systemManaged: boolean;
  organizationId: string;
  organization: Organization;
  createdAt: string;
  updatedAt: string;
  _count: { revisions: number; deployments: number; products: number };
  revisions: ProxyRevisionSummary[];
  deployments: ProxyActiveDeployment[];
}

export interface ApiProductSummary {
  id: string;
  name: string;
  active: boolean;
  scopes: string[];
}

export interface ApiProxyDetail extends ApiProxySummary {
  products: ApiProductSummary[];
}

export interface OperationPolicy {
  id: string;
  type: string;
  order: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface ProxyOperation {
  id: string;
  operationId: string;
  method: string;
  mode: 'forward' | 'local';
  path: string;
  targetPath: string | null;
  policies: OperationPolicy[];
}

export interface ProxyRevisionDetail extends ProxyRevisionSummary {
  operations: ProxyOperation[];
  warnings?: string[];
}

export interface ProxyDeployment {
  id: string;
  proxyId: string;
  revisionId: string;
  environmentId: string;
  upstreamBaseUrl: string | null;
  status: DeploymentStatus;
  createdAt: string;
  updatedAt: string;
  revision: {
    revisionNumber: number;
    basePath: string;
    contentHash: string;
  };
  environment: Pick<Environment, 'id' | 'stage' | 'region' | 'publicOrigin'>;
}

export interface RuntimeGatewayStatus {
  instanceId: string;
  state: 'loading' | 'applied' | 'error';
  appliedVersion: number;
  lastAppliedAt: string | null;
  lastError: string | null;
  synchronized: boolean;
}

export interface RuntimeSyncStatus {
  latestVersion: number;
  pendingChanges: number;
  redisAvailable: boolean;
  gateways: RuntimeGatewayStatus[];
}

export interface RuntimeMutationResponse {
  deployment: ProxyDeployment;
  runtimeRefreshRequired: false;
  runtimeSync: { version: number; state: 'queued' };
}

export type {
  CompiledProxyConfiguration,
  ConfiguredProxyResult,
  OpenApiInspection,
  ProxyConfigurationValidation,
} from '@/lib/proxy-creation';

export interface AppCredential {
  id: string;
  consumerKey: string;
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
