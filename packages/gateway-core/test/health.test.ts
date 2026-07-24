import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

describe('Gateway Core — Health & Routing', () => {
  // Creamos una sola instancia del servidor para todos los tests del bloque.
  // Es más eficiente que crear/destruir el servidor en cada test.
  let server: Awaited<ReturnType<typeof buildServer>>;

  before(async () => {
    server = await buildServer();
  });

  after(async () => {
    await server.close();
  });

  // ─── Health check ────────────────────────────────────────────────────────

  it('GET /health → 200 con status ok', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 200);

    const body = JSON.parse(response.body);
    assert.equal(body.status, 'ok');
    assert.ok(typeof body.proxiesLoaded === 'number', 'proxiesLoaded debe ser un número');
    assert.ok(typeof body.timestamp === 'string', 'timestamp debe ser un string');
  });

  // ─── Routing ─────────────────────────────────────────────────────────────

  it('GET a ruta sin proxy configurado → 404', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/ruta-que-no-existe',
    });

    assert.equal(response.statusCode, 404);

    const body = JSON.parse(response.body);
    assert.equal(body.error, 'Not Found');
    assert.ok(body.message.includes('/ruta-que-no-existe'), 'El mensaje debe incluir la ruta solicitada');
  });

  it('GET a ruta configurada → intenta forward (502 porque el backend mock no está en test)', async () => {
    // En el entorno de test no hay backend mock corriendo.
    // Esperamos 502 (Bad Gateway): el gateway resolvió el proxy correctamente
    // pero no pudo conectar al backend. Esto prueba que el resolver funciona.
    const response = await server.inject({
      method: 'GET',
      url: '/api/users',
    });

    // 200 si el backend mock está corriendo, 502 si no está.
    // Ambos son aceptables aquí — lo importante es que NO sea 404.
    assert.ok(
      response.statusCode !== 404,
      `El gateway debería haber resuelto el proxy para /api/users (recibido ${response.statusCode})`,
    );
  });

  it('GET /api/users/1 → resuelve al proxy de users (prefijo match)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/users/1',
    });

    // /api/users/1 debe matchear el proxy con basePath="/api/users"
    assert.ok(
      response.statusCode !== 404,
      '/api/users/1 debería matchear el proxy de /api/users',
    );
  });
});
