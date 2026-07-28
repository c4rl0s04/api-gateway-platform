import type { ProxyConfig, EndpointConfig } from '@api-gateway/shared';

/**
 * In-memory active deployment registry.
 * First key: environment ID.
 * Second key: proxy basePath (e.g. "/api/users").
 */
const registry = new Map<string, Map<string, ProxyConfig>>();
let registryInitialized = false;

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

      let environmentRegistry = registry.get(proxy.environment.id);
      if (!environmentRegistry) {
        environmentRegistry = new Map<string, ProxyConfig>();
        registry.set(proxy.environment.id, environmentRegistry);
      }
      if (environmentRegistry.has(proxy.basePath)) {
        throw new Error(
          `Environment "${proxy.environment.id}" has multiple active deployments `
          + `for basePath "${proxy.basePath}"`,
        );
      }
      environmentRegistry.set(proxy.basePath, proxy);
    }
  }
  registryInitialized = true;
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
export function resolveProxy(
  environmentId: string,
  requestPath: string,
): ProxyConfig | null {
  let bestMatch: ProxyConfig | null = null;
  let bestMatchLength = 0;
  const environmentRegistry = registry.get(environmentId);
  if (!environmentRegistry) {
    return null;
  }

  for (const [basePath, proxy] of environmentRegistry) {
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
  let size = 0;
  for (const environmentRegistry of registry.values()) {
    size += environmentRegistry.size;
  }
  return size;
}

/** Returns the number of environments that have at least one active deployment. */
export function getRegistryEnvironmentCount(): number {
  return registry.size;
}

/** Indicates that the initial proxy configuration load completed successfully. */
export function isRegistryReady(): boolean {
  return registryInitialized;
}
