import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type {
  ApiProxyDetail,
  ProxyDeployment,
  ProxyRevisionDetail,
} from '@/lib/api-client';
import { selectManagementAccessToken } from '@/lib/management-auth';
import {
  parsePlaygroundExecutionInput,
  PlaygroundValidationError,
} from '@/lib/playground';
import {
  executePlaygroundRequest,
  type PlaygroundCatalog,
} from '@/lib/playground-service';
import { createPlaygroundTransport } from '@/lib/playground-transport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

class ManagementCatalogError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ManagementCatalogError';
  }
}

function accessToken(request: NextRequest): string | null {
  return selectManagementAccessToken(
    request.headers.get('authorization'),
    cookies().get('management_access_token')?.value,
  );
}

function managementCatalog(token: string): PlaygroundCatalog {
  const baseUrl = process.env.MANAGEMENT_API_URL ?? 'http://localhost:3002';
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(new URL(`/v1/${path}`, baseUrl), {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as {
        message?: string;
        error?: string;
      };
      throw new ManagementCatalogError(
        response.status,
        body.message ?? body.error ?? 'Management catalog request failed',
      );
    }
    return response.json() as Promise<T>;
  }
  return {
    getProxy: proxyId => get<ApiProxyDetail>(`proxies/${encodeURIComponent(proxyId)}`),
    listDeployments: proxyId => get<ProxyDeployment[]>(
      `proxies/${encodeURIComponent(proxyId)}/deployments`,
    ),
    getRevision: (proxyId, revisionNumber) => get<ProxyRevisionDetail>(
      `proxies/${encodeURIComponent(proxyId)}/revisions/${revisionNumber}`,
    ),
  };
}

export async function POST(request: NextRequest) {
  const token = accessToken(request);
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const input = parsePlaygroundExecutionInput(await request.json());
    const result = await executePlaygroundRequest(
      input,
      managementCatalog(token),
      createPlaygroundTransport(),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlaygroundValidationError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    if (error instanceof ManagementCatalogError) {
      return NextResponse.json(
        { error: 'playground_catalog_error', message: error.message },
        { status: error.status },
      );
    }
    console.error('Playground request failed', error instanceof Error ? error.message : error);
    return NextResponse.json({
      error: 'playground_gateway_unavailable',
      message: 'The gateway request could not be completed',
    }, { status: 502 });
  }
}
