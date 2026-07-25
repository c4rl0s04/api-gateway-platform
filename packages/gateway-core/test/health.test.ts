import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

describe('Gateway Core — Health & Routing with Explicit Endpoints', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  before(async () => {
    server = await buildServer();
  });

  after(async () => {
    await server.close();
  });

  it('GET /health → 200 con status ok', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.status, 'ok');
  });

  it('GET a ruta sin proxy configurado → 404 (No proxy)', async () => {
    const response = await server.inject({ method: 'GET', url: '/ruta-que-no-existe' });
    assert.equal(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.equal(body.error, 'Not Found');
    assert.ok(body.message.includes('No proxy is configured'));
  });

  it('GET a proxy configurado pero endpoint no existente → 404 (Endpoint not found)', async () => {
    const response = await server.inject({ method: 'GET', url: '/es/banking/v1/foo/bar' });
    assert.equal(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.equal(body.error, 'Not Found');
    assert.ok(body.message.includes('Endpoint not found in proxy proxy-es-banking'));
  });

  it('GET a endpoint explícito (raíz) → Intenta forward', async () => {
    const response = await server.inject({ method: 'GET', url: '/es/banking/v1/accounts' });
    // Si el backend mock está apagado da 502. Si está encendido da 200. Ambos demuestran que el gateway intentó el forward.
    assert.ok(response.statusCode === 502 || response.statusCode === 200); 
  });

  it('GET a endpoint explícito con variables (/:id) → Intenta forward', async () => {
    const response = await server.inject({ method: 'GET', url: '/es/banking/v1/accounts/1' });
    // Si está apagado da 502. Si está encendido da 404 (porque el json-server no tiene la cuenta 1) o 200.
    assert.ok(response.statusCode === 502 || response.statusCode === 404 || response.statusCode === 200); 
    
    if (response.statusCode === 404) {
      // Si fue un 404, debemos asegurarnos de que viene del upstream o es un 502, y no un error interno de "Endpoint not found"
      const body = JSON.parse(response.body);
      assert.notEqual(body.message, 'Endpoint not found in proxy proxy-es-banking for path suffix: /1');
    }
  });
});
