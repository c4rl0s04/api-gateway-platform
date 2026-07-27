import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = cookies().get('management_access_token')?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const response = await fetch(
    `${process.env.MANAGEMENT_API_URL ?? 'http://localhost:3002'}/v1/me`,
    {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const result = NextResponse.json(
      { authenticated: false },
      { status: response.status },
    );
    if (response.status === 401) {
      result.cookies.delete('management_access_token');
    }
    return result;
  }
  return NextResponse.json({
    authenticated: true,
    principal: await response.json(),
  });
}
