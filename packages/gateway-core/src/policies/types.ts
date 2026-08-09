import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  BasePolicyConfig,
  ProxyConfig,
  EndpointConfig,
} from '@api-gateway/shared';

/**
 * Información del cliente autenticado.
 * La rellena una política de autenticación y la usan
 * las políticas siguientes del pipeline (rate-limit, audit-log, authz).
 */
export interface ClientContext {
  appId:          string;
  credentialId:   string;
  consumerKey:    string;
  organizationId: string;
  workspaceId?:    string;
  /** Semana 4: productos a los que tiene acceso esta app. */
  productIds:     string[];
  scopes:         string[];
}

/**
 * Contexto compartido entre todas las políticas del pipeline.
 *
 * Es mutable: las políticas pueden escribir en `client` y `state`
 * para pasar información a las siguientes políticas de la cadena.
 * Nunca hay que mutar `req` o `reply` directamente en una política
 * salvo para añadir headers de respuesta (Retry-After, X-RateLimit-*).
 */
export interface PolicyContext {
  req:      FastifyRequest;
  reply:    FastifyReply;
  proxy:    ProxyConfig;
  endpoint: EndpointConfig;
  /** Parámetros de ruta extraídos por el resolver. Ej: { id: "123" } */
  params:   Record<string, string>;
  /** Relleno por la política de autenticación. Undefined si aún no se autenticó. */
  client?:  ClientContext;
  /** Bolsa de estado libre para comunicación entre políticas. */
  state:    Record<string, unknown>;
}

/**
 * Resultado que devuelve cada política.
 *
 * - `continue`: la política pasó, ejecutar la siguiente.
 * - `halt`: la política cortó la cadena. El gateway responde con statusCode y body
 *            sin llegar al backend ni ejecutar más políticas.
 */
export type PolicyResult =
  | { action: 'continue' }
  | { action: 'halt'; statusCode: number; body: Record<string, unknown> }
  | {
      action: 'respond';
      statusCode: number;
      headers: Record<string, string>;
      body: unknown;
    };

/** Función que implementa la lógica de una política. */
export type Policy = (ctx: PolicyContext) => Promise<PolicyResult>;

/**
 * Función que crea una Policy a partir de su configuración.
 * El patrón factory permite que cada policy tenga su propia config tipada
 * sin que el registry necesite conocer los detalles de cada una.
 */
export type PolicyFactory = (config: BasePolicyConfig) => Policy;

/** Singleton de "continue" — evita crear un objeto nuevo en cada request. */
export const CONTINUE: PolicyResult = { action: 'continue' };

/** Helper para hacer el código de las políticas más legible. */
export function halt(
  statusCode: number,
  body: Record<string, unknown>,
): PolicyResult {
  return { action: 'halt', statusCode, body };
}

export function respond(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): PolicyResult {
  return { action: 'respond', statusCode, headers, body };
}
