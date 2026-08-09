import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import {
  SignJWT,
  decodeProtectedHeader,
  importPKCS8,
} from 'jose';
import type { IdentityStore } from './identity-store.js';
import {
  GatewayCtlError,
  type AgentProfile,
  type PublicIdentity,
} from './types.js';

const MAX_ASSERTION_TTL_SECONDS = 120;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export class AgentOperations {
  constructor(
    private readonly identities: IdentityStore,
    private readonly profile: AgentProfile,
  ) {}

  supportedMethods(): string[] {
    return [
      'agent.status',
      'identity.list',
      'identity.remove',
      'jwt.generateKey',
      'jwt.getPublicJwk',
      'jwt.signAssertion',
      'mtls.generateKeyAndCsr',
      'mtls.getCsr',
      'mtls.installCertificate',
      'mtls.executeRequest',
    ];
  }

  async execute(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'agent.status':
        return {
          connected: true,
          version: '1.0.0',
          supportedMethods: this.supportedMethods(),
        };
      case 'identity.list':
        return this.identities.list();
      case 'identity.remove':
        await this.identities.remove(requiredString(params, 'identityId'));
        return { removed: true };
      case 'jwt.generateKey':
        return this.identities.generateJwt({
          name: requiredString(params, 'name'),
          consumerKey: optionalString(params, 'consumerKey'),
        });
      case 'jwt.getPublicJwk':
        return this.getJwtIdentity(requiredString(params, 'identityId'));
      case 'jwt.signAssertion':
        return this.signAssertion(params);
      case 'mtls.generateKeyAndCsr':
        return this.identities.generateMtls({
          name: requiredString(params, 'name'),
          credentialId: requiredString(params, 'credentialId'),
          algorithm: optionalEnum(params, 'algorithm', ['rsa', 'ec']),
        });
      case 'mtls.getCsr':
        return { csr: await this.identities.getCsr(requiredString(params, 'identityId')) };
      case 'mtls.installCertificate':
        return this.identities.installCertificate({
          identityId: requiredString(params, 'identityId'),
          certificatePem: requiredString(params, 'certificatePem'),
          chainPem: optionalString(params, 'chainPem'),
        });
      case 'mtls.executeRequest':
        return this.executeMtlsRequest(params);
      default:
        throw new GatewayCtlError(
          'operation_not_allowed',
          'The requested local-agent operation is not allowed',
        );
    }
  }

  private async getJwtIdentity(identityId: string): Promise<PublicIdentity> {
    const identity = await this.identities.get(identityId);
    if (identity.type !== 'jwt' || identity.algorithm !== 'RS256' || !identity.publicJwk) {
      throw new GatewayCtlError('invalid_jwt_identity', 'Identity cannot sign RS256 assertions');
    }
    return {
      ...(await this.identities.list()).find(candidate => candidate.id === identityId)!,
    };
  }

  private async signAssertion(params: Record<string, unknown>): Promise<unknown> {
    const identity = await this.identities.get(requiredString(params, 'identityId'));
    if (identity.type !== 'jwt' || identity.algorithm !== 'RS256' || !identity.publicJwk) {
      throw new GatewayCtlError('invalid_jwt_identity', 'Identity cannot sign RS256 assertions');
    }
    const consumerKey = requiredString(params, 'consumerKey');
    if (identity.consumerKey && identity.consumerKey !== consumerKey) {
      throw new GatewayCtlError(
        'consumer_key_mismatch',
        'Identity is linked to a different consumer key',
      );
    }
    const audience = validateAudience(
      requiredString(params, 'audience'),
      this.profile.allowedAudienceHosts,
    );
    const ttlSeconds = optionalInteger(params, 'ttlSeconds') ?? 60;
    if (ttlSeconds < 1 || ttlSeconds > MAX_ASSERTION_TTL_SECONDS) {
      throw new GatewayCtlError(
        'invalid_assertion_ttl',
        `Assertion lifetime must be between 1 and ${MAX_ASSERTION_TTL_SECONDS} seconds`,
      );
    }
    const privateKey = await importPKCS8(
      await this.identities.readPrivateKey(identity),
      'RS256',
    );
    const now = Math.floor(Date.now() / 1000);
    const kid = requiredString(params, 'kid');
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
      .setIssuer(consumerKey)
      .setSubject(consumerKey)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      .setJti(randomUUID())
      .sign(privateKey);
    return {
      assertion,
      header: decodeProtectedHeader(assertion),
      payload: {
        iss: consumerKey,
        sub: consumerKey,
        aud: audience,
        iat: now,
        exp: now + ttlSeconds,
      },
      expiresAt: new Date((now + ttlSeconds) * 1000).toISOString(),
    };
  }

  private async executeMtlsRequest(params: Record<string, unknown>): Promise<unknown> {
    const identity = await this.identities.get(requiredString(params, 'identityId'));
    if (identity.type !== 'mtls' || !identity.certificateFile) {
      throw new GatewayCtlError(
        'mtls_certificate_missing',
        'mTLS identity has no installed certificate',
      );
    }
    const url = validateAudience(
      requiredString(params, 'url'),
      this.profile.allowedAudienceHosts,
    );
    const method = (optionalString(params, 'method') ?? 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
      throw new GatewayCtlError('invalid_http_method', 'HTTP method is not allowed');
    }
    const headers = safeHeaders(params.headers);
    const body = optionalString(params, 'body');
    if (body && Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new GatewayCtlError('request_too_large', 'Request body exceeds 256 KiB');
    }
    const [certificate, chain, privateKey] = await Promise.all([
      readFile(identity.certificateFile, 'utf8'),
      identity.chainFile ? readFile(identity.chainFile, 'utf8') : Promise.resolve(''),
      this.identities.readPrivateKey(identity),
    ]);
    const configuredCa = this.profile.gatewayCaCertificateFile
      ? await readFile(this.profile.gatewayCaCertificateFile, 'utf8')
      : undefined;
    return sendHttpsRequest({
      url,
      method,
      headers,
      body,
      certificate: `${certificate}${chain}`,
      privateKey,
      caCertificate: optionalString(params, 'caCertificatePem') ?? configuredCa,
    });
  }
}

function validateAudience(value: string, allowedHosts: string[]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayCtlError('invalid_audience', 'Audience must be an absolute URL');
  }
  if (url.protocol !== 'https:') {
    throw new GatewayCtlError('invalid_audience', 'Only HTTPS destinations are allowed');
  }
  const allowed = allowedHosts.some(pattern => pattern.startsWith('*.')
    ? url.hostname.endsWith(pattern.slice(1))
      && url.hostname.length > pattern.length - 1
    : url.hostname === pattern);
  if (!allowed) {
    throw new GatewayCtlError('audience_not_allowed', 'Destination host is not allowed');
  }
  return url.toString();
}

function requiredString(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GatewayCtlError('invalid_params', `${name} is required`);
  }
  return value.trim();
}

function optionalString(params: Record<string, unknown>, name: string): string | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new GatewayCtlError('invalid_params', `${name} must be a string`);
  }
  return value;
}

function optionalInteger(params: Record<string, unknown>, name: string): number | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    throw new GatewayCtlError('invalid_params', `${name} must be an integer`);
  }
  return value as number;
}

function optionalEnum<T extends string>(
  params: Record<string, unknown>,
  name: string,
  values: readonly T[],
): T | undefined {
  const value = params[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new GatewayCtlError('invalid_params', `${name} is invalid`);
  }
  return value as T;
}

function safeHeaders(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayCtlError('invalid_headers', 'Headers must be an object');
  }
  const blocked = new Set([
    'connection',
    'content-length',
    'host',
    'proxy-authorization',
    'transfer-encoding',
    'x-gateway-client-cert-sha256',
  ]);
  const result: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    const normalized = name.toLowerCase();
    if (blocked.has(normalized) || !/^[a-z0-9-]+$/u.test(normalized)) {
      throw new GatewayCtlError('header_not_allowed', `Header ${name} is not allowed`);
    }
    if (typeof headerValue !== 'string' || /[\r\n]/u.test(headerValue)) {
      throw new GatewayCtlError('invalid_headers', `Header ${name} is invalid`);
    }
    result[normalized] = headerValue;
  }
  return result;
}

async function sendHttpsRequest(input: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  certificate: string;
  privateKey: string;
  caCertificate?: string;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.request(input.url, {
      method: input.method,
      headers: input.headers,
      cert: input.certificate,
      key: input.privateKey,
      ca: input.caCertificate,
      rejectUnauthorized: true,
      timeout: 10_000,
    }, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new GatewayCtlError(
            'response_too_large',
            'Response body exceeds 1 MiB',
          ));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: filterResponseHeaders(response.headers),
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('timeout', () => request.destroy(
      new GatewayCtlError('request_timeout', 'mTLS request timed out'),
    ));
    request.on('error', reject);
    if (input.body) request.write(input.body);
    request.end();
  });
}

function filterResponseHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string | string[]> {
  const blocked = new Set(['set-cookie', 'proxy-authenticate']);
  const safe: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (blocked.has(name) || value === undefined) continue;
    safe[name] = value;
  }
  return safe;
}
