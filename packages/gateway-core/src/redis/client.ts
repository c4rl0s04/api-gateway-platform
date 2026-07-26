import { Redis } from 'ioredis';

let redisClient: Redis | null = null;
let redisUrl = 'redis://localhost:6379';

export function configureRedisConnection(url: string): void {
  if (redisClient && redisUrl !== url) {
    throw new Error('Redis connection is already initialized with a different URL');
  }
  redisUrl = url;
}

/**
 * Devuelve el singleton del cliente Redis.
 * Se crea en la primera llamada y se reutiliza en las siguientes.
 *
 * El patrón lazy singleton evita conectar a Redis hasta que realmente
 * se necesita (la primera policy de rate-limit que se ejecute).
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      // Connect on the first command so endpoints without Redis-backed policies
      // do not pay the connection cost.
      lazyConnect: true,
      // Reintentar con backoff exponencial hasta 3 veces, luego desistir
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      // Timeout razonable para un rate limiter: si Redis tarda más de 1s, algo va mal
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
    });

    redisClient.on('error', (err: Error) => {
      // Logueamos el error pero no lanzamos: el gateway sigue funcionando
      // sin rate limiting si Redis no está disponible (degraded mode).
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.info('[Redis] Connected successfully');
    });
  }

  return redisClient;
}

/** Cierra la conexión Redis limpiamente. Llamar al shutdown del servidor. */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    if (redisClient.status === 'ready') {
      await redisClient.quit();
    } else {
      redisClient.disconnect();
    }
    redisClient = null;
  }
}
