import type { ProxyConfig, EndpointConfig } from '@api-gateway/shared';

/**
 * Registro en memoria de proxies activos.
 * Clave: basePath del proxy (ej: "/api/users")
 * Valor: configuración completa del proxy
 *
 * En semana 2, este Map se poblará desde Postgres al arrancar.
 * La interfaz pública de este módulo NO cambiará cuando hagamos ese cambio.
 */
const registry = new Map<string, ProxyConfig>();

/**
 * Carga (o recarga) el registro de proxies en memoria.
 * Llamar a esta función con una lista nueva reemplaza el registro completo.
 * Solo se registran proxies con active=true.
 */
export function loadProxies(proxies: ProxyConfig[]): void {
  registry.clear();
  for (const proxy of proxies) {
    if (proxy.active) {
      registry.set(proxy.basePath, proxy);
    }
  }
}

/**
 * Convierte un path con parámetros (ej. "/users/:id") en una RegExp.
 */
function compileEndpointPath(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const regexStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  // Match estricto, permitiendo un trailing slash opcional
  return { regex: new RegExp(`^${regexStr}/?$`), keys };
}

export interface ResolvedEndpoint {
  endpoint: EndpointConfig;
  params: Record<string, string>;
}

/**
 * Busca un endpoint dentro de un proxy usando el sufijo de la URL.
 * Soporta variables en el path (ej. "/:id") extrayéndolas en "params".
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
 * Resuelve qué proxy corresponde a un path de request entrante.
 * Usa matching por prefijo: /api/users/1 matchea el proxy con basePath "/api/users".
 *
 * Si hay múltiples proxies cuyos basePaths son prefijos del path solicitado,
 * gana el más específico (mayor longitud). Esto es importante para casos como:
 *   - /api/users     → proxy A
 *   - /api/users/admin → proxy B (más específico)
 *
 * @returns El ProxyConfig que corresponde, o null si ningún proxy matchea.
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

/** Devuelve el número de proxies activos registrados. Útil para health checks y logs. */
export function getRegistrySize(): number {
  return registry.size;
}
