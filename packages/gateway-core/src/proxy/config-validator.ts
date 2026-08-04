import type { ProxyConfig } from '@api-gateway/shared';

export function validateProxyConfiguration(proxies: ProxyConfig[]): void {
  for (const proxy of proxies) {
    for (const endpoint of proxy.endpoints) {
      const types = endpoint.policies
        .filter(policy => policy.enabled)
        .map(policy => policy.type);
      const authenticationTypes = types.filter(type =>
        ['api-key-auth', 'oauth-access-token', 'mtls-auth'].includes(type));
      if (authenticationTypes.length > 1) {
        throw new Error(`Endpoint "${endpoint.id}" configures more than one authentication policy`);
      }
      if (endpoint.mode === 'local' && !types.some(type =>
        type === 'oauth-token' || type === 'jwks-endpoint')) {
        throw new Error(`Local endpoint "${endpoint.id}" has no terminal response policy`);
      }
      if (endpoint.mode === 'forward' && (!endpoint.targetPath || !proxy.upstreamBaseUrl)) {
        throw new Error(`Forward endpoint "${endpoint.id}" requires targetPath and upstreamBaseUrl`);
      }
      if ((types.includes('oauth-token') || types.includes('jwks-endpoint'))
        && endpoint.mode !== 'local') {
        throw new Error(`Terminal OAuth policy on "${endpoint.id}" requires local mode`);
      }
    }
  }
}
