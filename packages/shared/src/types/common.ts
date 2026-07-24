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

export interface EndpointConfig {
  id: string;
  /** El sufijo exacto de la ruta. Ej: "/health", "/users", o con variables "/users/:id" */
  path: string;
  /** A dónde redirigir esta llamada específica. Ej: "http://localhost:4000/users/:id" */
  targetUrl: string;
  /** Políticas específicas de este endpoint */
  policies: PolicyConfig[];
}

/**
 * Configuración completa de un API Proxy.
 * Representa la unidad básica del gateway: un contenedor lógico que agrupa
 * varios endpoints bajo un mismo prefijo público.
 */
export interface ProxyConfig {
  id: string;
  name: string;
  /** Prefijo público que activa este proxy. Ejemplo: "/api" */
  basePath: string;
  /** Lista estricta de endpoints permitidos dentro de este proxy. */
  endpoints: EndpointConfig[];
  organizationId: string;
  environmentId: string;
  active: boolean;
}
