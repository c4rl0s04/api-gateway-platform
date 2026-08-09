import type { PolicyConfig } from '../policies/config';
import type { EnvironmentConfig } from '../deployments/config';

export interface EndpointConfig {
  id: string;
  operationId: string;
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'PATCH' | 'TRACE';
  mode: 'forward' | 'local';
  /** El sufijo exacto de la ruta. Ej: "/health", "/users", o con variables "/users/:id" */
  path: string;
  /** Ruta del backend relativa al upstream del deployment. */
  targetPath: string | null;
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
  /** Deployment concreto cargado por esta instancia del gateway. */
  deploymentId: string;
  /** Immutable revision selected by the active deployment. */
  revisionId: string;
  revisionNumber: number;
  environment: EnvironmentConfig;
  /** Personal lab namespace. Null means standard runtime traffic. */
  workspaceId?: string | null;
  /** Host authority used by the resolver for this deployment context. */
  runtimeAuthority?: string;
  /** Public origin used as OAuth issuer and token endpoint audience. */
  runtimePublicOrigin?: string;
  systemManaged: boolean;
  /** Origin del backend para el deployment seleccionado. */
  upstreamBaseUrl: string | null;
  /** Lista estricta de endpoints permitidos dentro de este proxy. */
  endpoints: EndpointConfig[];
  organizationId: string;
  active: boolean;
}
