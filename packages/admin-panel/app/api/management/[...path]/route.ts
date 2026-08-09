import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { selectManagementAccessToken } from '@/lib/management-auth';

export const dynamic = 'force-dynamic';

async function proxy(
  request: NextRequest,
  context: { params: { path: string[] } },
) {
  const token = selectManagementAccessToken(
    request.headers.get('authorization'),
    cookies().get('management_access_token')?.value,
  );
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const target = new URL(
    `/v1/${context.params.path.join('/')}`,
    process.env.MANAGEMENT_API_URL ?? 'http://localhost:3002',
  );
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  const contentType = request.headers.get('content-type');
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(contentType ? { 'content-type': contentType } : {}),
    },
    body: ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
    cache: 'no-store',
  });
  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition', 'cache-control', 'pragma']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
