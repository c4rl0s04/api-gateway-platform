import type {
  ApiProxyDetail,
  ProxyDeployment,
  ProxyRevisionDetail,
} from '@/lib/api-client';
import type { PlaygroundCatalog } from '@/lib/playground-service';

interface LabWorkspace {
  hostname: string;
}

type Fetcher = typeof fetch;

export class LabPlaygroundCatalogError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'LabPlaygroundCatalogError';
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      message?: string;
      error?: string;
    };
    throw new LabPlaygroundCatalogError(
      response.status,
      body.message ?? body.error ?? 'Lab catalog request failed',
    );
  }
  return response.json() as Promise<T>;
}

function labPublicOrigin(environmentOrigin: string, hostname: string): string {
  const origin = new URL(environmentOrigin);
  origin.hostname = hostname;
  return origin.origin;
}

export async function createLabPlaygroundCatalog(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<PlaygroundCatalog> {
  const baseUrl = process.env.MANAGEMENT_API_URL ?? 'http://localhost:3002';
  const get = async <T>(path: string): Promise<T> => readJson<T>(await fetcher(
    new URL(`/lab/v1/${path}`, baseUrl),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  ));
  const workspace = await get<LabWorkspace>('workspace');

  return {
    getProxy: proxyId => get<ApiProxyDetail>(`proxies/${encodeURIComponent(proxyId)}`),
    listDeployments: async proxyId => {
      const deployments = await get<ProxyDeployment[]>(
        `proxies/${encodeURIComponent(proxyId)}/deployments`,
      );
      return deployments.map(deployment => ({
        ...deployment,
        environment: {
          ...deployment.environment,
          publicOrigin: labPublicOrigin(
            deployment.environment.publicOrigin,
            workspace.hostname,
          ),
        },
      }));
    },
    getRevision: (proxyId, revisionNumber) => get<ProxyRevisionDetail>(
      `proxies/${encodeURIComponent(proxyId)}/revisions/${revisionNumber}`,
    ),
  };
}
