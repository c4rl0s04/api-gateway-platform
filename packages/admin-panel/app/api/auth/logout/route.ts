import { NextResponse } from 'next/server';
import { oidcConfig, publicApplicationUrl } from '@/lib/oidc';

export async function GET() {
  const response = NextResponse.redirect(publicApplicationUrl(oidcConfig().callbackUrl));
  response.cookies.delete('management_access_token');
  response.cookies.delete('oidc_state');
  response.cookies.delete('oidc_verifier');
  return response;
}
