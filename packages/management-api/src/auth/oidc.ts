import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';

export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  claims: JWTPayload;
}

export interface OidcVerifier {
  verify(token: string): Promise<VerifiedIdentity>;
}

export function createOidcVerifier(input: {
  issuer: string;
  audience: string;
  jwksUri?: string;
  keyResolver?: JWTVerifyGetKey;
}): OidcVerifier {
  const keyResolver = input.keyResolver ?? createRemoteJWKSet(
    new URL(input.jwksUri ?? `${input.issuer}/protocol/openid-connect/certs`),
  );
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, keyResolver, {
        algorithms: ['RS256'],
        issuer: input.issuer,
        audience: input.audience,
        requiredClaims: ['iss', 'sub', 'iat', 'exp'],
      });
      if (!payload.iss || !payload.sub) {
        throw new Error('OIDC token is missing issuer or subject');
      }
      return {
        issuer: payload.iss,
        subject: payload.sub,
        claims: payload,
      };
    },
  };
}
