import { request as undiciRequest } from 'undici';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProxyConfig } from '@api-gateway/shared';

/**
 * Construye la URL del backend eliminando el basePath del gateway.
 *
 * Ejemplo:
 *   requestUrl = "/api/users/1?active=true"
 *   basePath   = "/api/users"
 *   targetUrl  = "http://localhost:4000"
 *   resultado  = "http://localhost:4000/users/1?active=true"
 *
 * El basePath del gateway desaparece porque el backend no sabe nada de él.
 */
function buildTargetUrl(requestUrl: string, proxy: ProxyConfig): string {
  const withoutBasePath = requestUrl.slice(proxy.basePath.length) || '/';
  return `${proxy.targetUrl}${withoutBasePath}`;
}

/**
 * Determina si una request lleva body que hay que reenviar al backend.
 * GET y HEAD nunca llevan body según la especificación HTTP.
 */
function hasBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

/**
 * Reenvía una request de Fastify al backend configurado en el proxy.
 * Escribe la respuesta del backend directamente en el reply de Fastify.
 *
 * En caso de error de conexión al backend, responde 502 Bad Gateway
 * sin exponer detalles internos al cliente.
 */
export async function forwardRequest(
  req: FastifyRequest,
  reply: FastifyReply,
  proxy: ProxyConfig,
): Promise<void> {
  const targetUrl = buildTargetUrl(req.url, proxy);

  req.log.info(
    { targetUrl, proxyId: proxy.id, method: req.method },
    'Forwarding request to backend',
  );

  try {
    const upstream = await undiciRequest(targetUrl, {
      method: req.method as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'DELETE'
        | 'PATCH'
        | 'OPTIONS'
        | 'HEAD',

      headers: {
        // Pasamos los headers originales del cliente al backend...
        ...req.headers,
        // ...pero sobreescribimos host para que el backend reciba su propio host,
        // no el del gateway. Sin esto, algunos backends rechazan la request.
        host: new URL(proxy.targetUrl).host,
        // Headers de trazabilidad estándar: permiten rastrear la request
        // a través de múltiples servicios en los logs.
        'x-forwarded-for': req.ip,
        'x-forwarded-host': req.hostname,
        'x-request-id': req.id as string,
        // Header custom del gateway: útil para que el backend sepa
        // qué proxy procesó la request (auditoría, debugging).
        'x-proxy-id': proxy.id,
      },

      body: hasBody(req.method) && req.body
        ? JSON.stringify(req.body)
        : null,

      // Timeout razonable: si el backend no responde en 30s, cortamos.
      // En semana 4 esto será configurable por proxy.
      bodyTimeout: 30_000,
      headersTimeout: 30_000,
    });

    // Pasamos el status code del backend al cliente sin modificarlo
    reply.status(upstream.statusCode);

    // Pasamos el content-type del backend para que el cliente sepa
    // cómo interpretar el body (JSON, text, etc.)
    const contentType = upstream.headers['content-type'];
    if (contentType) {
      reply.header('content-type', contentType as string);
    }

    // Header informativo: el cliente puede ver qué proxy procesó su request
    reply.header('x-gateway-proxy', proxy.id);

    const body = await upstream.body.text();
    reply.send(body);

  } catch (err) {
    // Error de conexión: el backend no está disponible.
    // Logueamos el error interno con detalle, pero al cliente solo le decimos 502.
    req.log.error(
      { err, targetUrl, proxyId: proxy.id },
      'Backend unreachable or returned an error',
    );

    reply.status(502).send({
      error: 'Bad Gateway',
      message: 'The upstream service is temporarily unavailable',
      requestId: req.id,
    });
  }
}
