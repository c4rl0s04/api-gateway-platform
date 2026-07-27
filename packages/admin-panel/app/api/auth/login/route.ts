import { NextResponse } from 'next/server';
import { createCodeChallenge, oidcConfig, randomUrlSafe } from '@/lib/oidc';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = oidcConfig();
  const state = randomUrlSafe();
  const verifier = randomUrlSafe(48);
  const authorizationUrl = new URL(config.authorizationEndpoint);
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', config.callbackUrl);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid profile email');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('code_challenge', createCodeChallenge(verifier));
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authorizationUrl);
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.callbackUrl.startsWith('https:'),
    path: '/',
    maxAge: 600,
  };
  response.cookies.set('oidc_state', state, cookieOptions);
  response.cookies.set('oidc_verifier', verifier, cookieOptions);
  return response;
}
