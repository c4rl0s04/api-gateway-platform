import { createPublicKey } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { importJWK, importPKCS8, type JWK } from 'jose';
import type { GatewayEnv } from '../config/env.js';

export interface OAuthRuntime {
  signingKeyId: string;
  signingKey: Awaited<ReturnType<typeof importPKCS8>>;
  verificationKey: Awaited<ReturnType<typeof importJWK>>;
  publicJwk: JWK;
  developerTokenIssuanceKey?: Uint8Array;
  trustedProxyCidrs: Array<[ipaddr.IPv4 | ipaddr.IPv6, number]>;
}

let runtime: OAuthRuntime | null = null;

export async function configureOAuthRuntime(config: GatewayEnv): Promise<void> {
  if (
    !config.OAUTH_SIGNING_PRIVATE_KEY_BASE64
    || !config.OAUTH_SIGNING_KEY_ID
    || !config.MTLS_TRUSTED_PROXY_CIDRS
  ) {
    runtime = null;
    return;
  }

  const pem = Buffer.from(
    config.OAUTH_SIGNING_PRIVATE_KEY_BASE64,
    'base64',
  ).toString('utf8');
  const signingKey = await importPKCS8(pem, 'RS256');
  const exported = createPublicKey(pem).export({ format: 'jwk' });
  const publicJwk: JWK = {
    kty: exported.kty,
    n: exported.n,
    e: exported.e,
    alg: 'RS256',
    use: 'sig',
    kid: config.OAUTH_SIGNING_KEY_ID,
  };
  const trustedProxyCidrs = config.MTLS_TRUSTED_PROXY_CIDRS
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => ipaddr.parseCIDR(value));

  runtime = {
    signingKeyId: config.OAUTH_SIGNING_KEY_ID,
    signingKey,
    verificationKey: await importJWK(publicJwk, 'RS256'),
    publicJwk,
    ...(config.DEVELOPER_TOKEN_ISSUANCE_SECRET
      ? { developerTokenIssuanceKey: new TextEncoder().encode(config.DEVELOPER_TOKEN_ISSUANCE_SECRET) }
      : {}),
    trustedProxyCidrs,
  };
}

export function getOAuthRuntime(): OAuthRuntime {
  if (!runtime) {
    throw new Error('OAuth cryptographic runtime is not configured');
  }
  return runtime;
}

export function isTrustedProxy(address: string): boolean {
  const parsed = ipaddr.process(address);
  return getOAuthRuntime().trustedProxyCidrs.some(([network, prefix]) => {
    const normalizedNetwork = network instanceof ipaddr.IPv6
      && network.isIPv4MappedAddress()
      ? network.toIPv4Address()
      : network;
    if (parsed instanceof ipaddr.IPv4 && normalizedNetwork instanceof ipaddr.IPv4) {
      return parsed.match(normalizedNetwork, prefix);
    }
    if (parsed instanceof ipaddr.IPv6 && normalizedNetwork instanceof ipaddr.IPv6) {
      return parsed.match(normalizedNetwork, prefix);
    }
    return false;
  });
}
