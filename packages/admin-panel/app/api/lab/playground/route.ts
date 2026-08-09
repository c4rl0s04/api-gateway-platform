import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  createLabPlaygroundCatalog,
  LabPlaygroundCatalogError,
} from '@/lib/lab-playground-service';
import { selectManagementAccessToken } from '@/lib/management-auth';
import {
  parsePlaygroundExecutionInput,
  PlaygroundValidationError,
} from '@/lib/playground';
import { executePlaygroundRequest } from '@/lib/playground-service';
import { createPlaygroundTransport } from '@/lib/playground-transport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const token = selectManagementAccessToken(
    request.headers.get('authorization'),
    cookies().get('management_access_token')?.value,
  );
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const input = parsePlaygroundExecutionInput(await request.json());
    const catalog = await createLabPlaygroundCatalog(token);
    const result = await executePlaygroundRequest(
      input,
      catalog,
      createPlaygroundTransport(),
    );
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof PlaygroundValidationError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    if (error instanceof LabPlaygroundCatalogError) {
      return NextResponse.json(
        { error: 'lab_resource_not_found', message: error.message },
        { status: error.status },
      );
    }
    console.error('Lab playground request failed', error instanceof Error ? error.message : error);
    return NextResponse.json({
      error: 'playground_gateway_unavailable',
      message: 'The lab gateway request could not be completed',
    }, { status: 502 });
  }
}
