import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { oidcConfig } from '@/lib/oidc';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const config = oidcConfig();
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const cookieStore = cookies();
  const expectedState = cookieStore.get('oidc_state')?.value;
  const verifier = cookieStore.get('oidc_verifier')?.value;
  if (!code || !state || state !== expectedState || !verifier) {
    return NextResponse.json(
      { error: 'invalid_oidc_callback' },
      { status: 400 },
    );
  }

  const tokenResponse = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      code,
      code_verifier: verifier,
    }),
    cache: 'no-store',
  });
  if (!tokenResponse.ok) {
    return NextResponse.json(
      { error: 'oidc_token_exchange_failed' },
      { status: 502 },
    );
  }
  const token = await tokenResponse.json() as {
    access_token: string;
    expires_in: number;
  };
  const response = NextResponse.redirect(new URL('/', config.callbackUrl));
  response.cookies.delete('oidc_state');
  response.cookies.delete('oidc_verifier');
  response.cookies.set('management_access_token', token.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.callbackUrl.startsWith('https:'),
    path: '/',
    maxAge: token.expires_in,
  });
  return response;
}
