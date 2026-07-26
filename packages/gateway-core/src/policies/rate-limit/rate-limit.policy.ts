import {
  rateLimitPolicyConfigSchema,
  type BasePolicyConfig,
} from '@api-gateway/shared';
import type { PolicyFactory } from '../types';
import { CONTINUE, halt } from '../types';
import { getRedisClient } from '../../redis/client';

export interface RateLimitClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

/**
 * Script Lua para rate limiting con ventana fija.
 *
 * La atomicidad del script Lua garantiza que no hay race conditions
 * entre múltiples instancias del gateway que compartan el mismo Redis.
 * Sin Lua, el patrón INCR + EXPIRE tiene una condición de carrera entre
 * las dos operaciones. Con Lua, Redis las ejecuta como una sola operación atómica.
 *
 * Retorna un array: [isLimited, retryAfterSeconds]
 *   isLimited = 1 si se superó el límite, 0 si no
 *   retryAfterSeconds = segundos hasta que la ventana se resetea
 */
const RATE_LIMIT_LUA = `
local key     = KEYS[1]
local limit   = tonumber(ARGV[1])
local window  = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end

if current > limit then
  local ttl = redis.call('TTL', key)
  return {1, ttl}
end

return {0, 0}
`;

/**
 * Política de rate limiting basada en ventana fija con contadores en Redis.
 *
 * La clave de rate limit incluye:
 * - Identificador del cliente (appId si está autenticado, IP si no)
 * - ID del proxy (cada proxy tiene su propio límite independiente)
 * - Bucket de la ventana temporal (floor del timestamp / windowSeconds)
 *
 * Esto permite que la política funcione tanto antes como después de api-key-auth
 * en el pipeline: antes de auth limita por IP, después de auth limita por appId.
 */
export function createRateLimitPolicyWithClient(
  rawConfig: BasePolicyConfig,
  getClient: () => RateLimitClient,
): ReturnType<PolicyFactory> {
  const config = rateLimitPolicyConfigSchema.parse(rawConfig);

  return async (ctx) => {
    // Si ya pasó la autenticación, limitamos por appId (más preciso).
    // Si no, limitamos por IP (útil si rate-limit va antes que api-key-auth).
    const identifier = ctx.client?.appId ?? ctx.req.ip;

    // Bucket de la ventana: todos los requests en la misma ventana comparten clave.
    const windowBucket = Math.floor(Date.now() / 1000 / config.windowSeconds);
    const key = `ratelimit:${identifier}:${ctx.proxy.id}:${windowBucket}`;

    // Añadimos headers informativos en todos los casos (buena práctica de APIs)
    ctx.reply.header('X-RateLimit-Limit', String(config.limit));

    let isLimited: number;
    let retryAfter: number;
    try {
      const result = await getClient().eval(
        RATE_LIMIT_LUA,
        1,
        key,
        String(config.limit),
        String(config.windowSeconds),
      );

      if (
        !Array.isArray(result)
        || result.length < 2
        || typeof result[0] !== 'number'
        || typeof result[1] !== 'number'
      ) {
        throw new Error('Redis returned an invalid rate-limit result');
      }

      [isLimited, retryAfter] = result;
    } catch (err) {
      ctx.req.log.error(
        {
          err,
          policyType: 'rate-limit',
          failureMode: config.failureMode,
          proxyId: ctx.proxy.id,
        },
        'Rate limit policy dependency failed',
      );

      ctx.state['rate-limit.degraded'] = true;
      if (config.failureMode === 'open') {
        ctx.reply.header('X-RateLimit-Policy', 'degraded');
        return CONTINUE;
      }

      return halt(503, {
        error: 'Service Unavailable',
        message: 'Rate limiting service is temporarily unavailable',
        requestId: ctx.req.id,
      });
    }

    if (isLimited) {
      ctx.reply.header('Retry-After', String(retryAfter));
      ctx.reply.header('X-RateLimit-Remaining', '0');

      return halt(429, {
        error:       'Too Many Requests',
        message:     `Rate limit of ${config.limit} requests per ${config.windowSeconds}s exceeded.`,
        retryAfter,
      });
    }

    return CONTINUE;
  };
}

export const createRateLimitPolicy: PolicyFactory = (rawConfig) =>
  createRateLimitPolicyWithClient(rawConfig, getRedisClient);
