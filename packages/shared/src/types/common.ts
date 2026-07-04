/**
 * Tipos de políticas disponibles en el pipeline del gateway.
 * Cada valor corresponde a una política implementada en gateway-core/src/policies/.
 */
export type PolicyType =
  | 'api-key-auth'
  | 'jwt-auth'
  | 'rate-limit'
  | 'transform'
  | 'schema-validation'
  | 'audit-log'
  | 'cors';

/**
 * Configuración de una política individual dentro de un proxy.
 * El campo `config` es libre (Record) porque cada política tiene sus propios parámetros.
 * Ejemplos:
 *   - rate-limit: { limit: 100, windowSeconds: 60 }
 *   - api-key-auth: { header: "x-api-key" }
 */
export interface PolicyConfig {
  type: PolicyType;
  /** Orden de ejecución dentro del pipeline. Menor número = se ejecuta antes. */
  order: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Configuración completa de un API Proxy.
 * Representa la unidad básica del gateway: un endpoint público que enruta
 * a un backend real y aplica un pipeline de políticas en el camino.
 */
export interface ProxyConfig {
  id: string;
  name: string;
  /** Prefijo de ruta pública que activa este proxy. Ejemplo: "/api/users" */
  basePath: string;
  /** URL base del backend real. Ejemplo: "http://payments-service:8080" */
  targetUrl: string;
  organizationId: string;
  environmentId: string;
  /** Lista ordenada de políticas a aplicar. En semana 1 siempre es []. */
  policies: PolicyConfig[];
  active: boolean;
}
