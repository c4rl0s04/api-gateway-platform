import type { ProxyConfig, EndpointConfig } from '@api-gateway/shared';

/**
 * In-memory active proxies registry.
 * Key: proxy basePath (e.g. "/api/users")
 * Value: full proxy configuration
 *
 * In week 2, this Map will be populated from Postgres on startup.
 * The public interface of this module will NOT change when we make that change.
 */
const registry = new Map<string, ProxyConfig>();

/**
 * Loads (or reloads) the proxies registry in memory.
 * Calling this function with a new list replaces the entire registry.
 * Only proxies with active=true are registered.
 */
export function loadProxies(proxies: ProxyConfig[]): void {
  registry.clear();
  for (const proxy of proxies) {
    if (proxy.active) {
      // Automatically sort endpoints:
      // 1. Static routes first (do not contain ':')
      // 2. Dynamic routes after
      // 3. On tie, the longest (most specific) go first
      proxy.endpoints.sort((a: EndpointConfig, b: EndpointConfig) => {
        const aDynamic = a.path.includes(':');
        const bDynamic = b.path.includes(':');
        
        if (aDynamic && !bDynamic) return 1; // b goes before a
        if (!aDynamic && bDynamic) return -1; // a goes before b
        
        return b.path.length - a.path.length; // longest first
      });

      registry.set(proxy.basePath, proxy);
    }
  }
}

/**
 * Converts a path with parameters (e.g. "/users/:id") into a RegExp.
 */
function compileEndpointPath(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const regexStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  // Strict match, allowing an optional trailing slash
  return { regex: new RegExp(`^${regexStr}/?$`), keys };
}

export interface ResolvedEndpoint {
  endpoint: EndpointConfig;
  params: Record<string, string>;
}

/**
 * Finds an endpoint within a proxy using the URL suffix.
 * Supports variables in the path (e.g. "/:id") extracting them into "params".
 */
export function resolveEndpoint(proxy: ProxyConfig, requestSuffix: string): ResolvedEndpoint | null {
  const suffix = requestSuffix || '/';

  for (const endpoint of proxy.endpoints) {
    const { regex, keys } = compileEndpointPath(endpoint.path);
    const match = suffix.match(regex);
    
    if (match) {
      const params: Record<string, string> = {};
      keys.forEach((key, index) => {
        params[key] = match[index + 1];
      });
      return { endpoint, params };
    }
  }

  return null;
}

/**
 * Resolves which proxy corresponds to an incoming request path.
 * Uses prefix matching: /api/users/1 matches the proxy with basePath "/api/users".
 *
 * If there are multiple proxies whose basePaths are prefixes of the requested path,
 * the most specific one (longest length) wins. This is important for cases like:
 *   - /api/users     → proxy A
 *   - /api/users/admin → proxy B (more specific)
 *
 * @returns The ProxyConfig that matches, or null if no proxy matches.
 */
export function resolveProxy(requestPath: string): ProxyConfig | null {
  let bestMatch: ProxyConfig | null = null;
  let bestMatchLength = 0;

  for (const [basePath, proxy] of registry) {
    const matches =
      requestPath === basePath || requestPath.startsWith(basePath + '/');

    if (matches && basePath.length > bestMatchLength) {
      bestMatch = proxy;
      bestMatchLength = basePath.length;
    }
  }

  return bestMatch;
}

/** Returns the number of active registered proxies. Useful for health checks and logs. */
export function getRegistrySize(): number {
  return registry.size;
}
