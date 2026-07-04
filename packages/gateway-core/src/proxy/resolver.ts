import type { ProxyConfig } from '@api-gateway/shared';

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
