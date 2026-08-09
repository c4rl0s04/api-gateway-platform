import { isIP } from 'node:net';

const blockedHeaders = new Set([
  'authorization', 'connection', 'cookie', 'host', 'keep-alive',
  'proxy-authenticate', 'proxy-authorization', 'set-cookie', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'x-forwarded-for', 'x-forwarded-host',
  'x-forwarded-proto', 'x-gateway-client-cert-sha256', 'x-proxy-id',
]);

export function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, '');
  const family = isIP(normalized);
  if (family === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return !(a === 0
      || a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a >= 224);
  }
  if (family === 6) {
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
    if (mapped) return isPublicAddress(mapped);
    return !(normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/u.test(normalized)
      || normalized.startsWith('ff'));
  }
  return false;
}

export function safeRequestHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    value !== undefined && !blockedHeaders.has(name.toLowerCase()))) as Record<
      string,
      string | string[]
    >;
}

export function safeResponseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) =>
    value !== undefined
    && !blockedHeaders.has(name.toLowerCase())
    && name.toLowerCase() !== 'content-length')) as Record<string, string | string[]>;
}

export function buildPublicTarget(base: string, requestPath: string): URL {
  const target = new URL(base);
  const incoming = new URL(requestPath, 'http://lab-egress.local');
  target.pathname = [
    target.pathname.replace(/\/+$/u, ''),
    incoming.pathname.replace(/^\/+/, ''),
  ].filter(Boolean).join('/');
  if (!target.pathname.startsWith('/')) target.pathname = `/${target.pathname}`;
  target.search = incoming.search;
  return target;
}
