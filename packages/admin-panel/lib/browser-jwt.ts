export interface BrowserJwtIdentity {
  kid: string;
  publicJwk: JsonWebKey & { alg: 'RS256'; use: 'sig'; kid: string };
  privateKey: CryptoKey;
}

export interface BrowserJwtAssertion {
  assertion: string;
  header: { alg: 'RS256'; kid: string; typ: 'JWT' };
  payload: {
    iss: string;
    sub: string;
    aud: string;
    iat: number;
    exp: number;
    jti: string;
  };
}

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export async function createBrowserJwtIdentity(): Promise<BrowserJwtIdentity> {
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const kid = `browser-${crypto.randomUUID()}`;
  return {
    kid,
    publicJwk: { ...publicJwk, alg: 'RS256', use: 'sig', kid },
    privateKey: pair.privateKey,
  };
}

export async function signBrowserJwtAssertion(input: {
  identity: BrowserJwtIdentity;
  consumerKey: string;
  audience: string;
  now?: number;
}): Promise<BrowserJwtAssertion> {
  const iat = input.now ?? Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256' as const, kid: input.identity.kid, typ: 'JWT' as const };
  const payload = {
    iss: input.consumerKey,
    sub: input.consumerKey,
    aud: input.audience,
    iat,
    exp: iat + 60,
    jti: crypto.randomUUID(),
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    input.identity.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return {
    assertion: `${signingInput}.${base64Url(new Uint8Array(signature))}`,
    header,
    payload,
  };
}
