import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LabUpstreamError,
  normalizeLabMockRoutes,
  normalizeLabPublicHttpsUrl,
} from '../src/lab-upstreams.js';

describe('lab upstream validation', () => {
  it('accepts only public HTTPS targets without embedded credentials', () => {
    assert.equal(
      normalizeLabPublicHttpsUrl('https://api.example.com:443/v1'),
      'https://api.example.com/v1',
    );
    for (const target of [
      'http://api.example.com',
      'https://user:secret@api.example.com',
      'https://localhost',
      'https://127.0.0.1',
      'https://10.0.0.1',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]',
    ]) {
      assert.throws(
        () => normalizeLabPublicHttpsUrl(target),
        (error: unknown) => error instanceof LabUpstreamError
          && error.code === 'lab_upstream_blocked',
      );
    }
  });

  it('normalizes declarative mock routes and rejects unsafe headers', () => {
    assert.deepEqual(normalizeLabMockRoutes([{
      method: ' get ',
      path: '/accounts',
      status: 200,
      headers: { 'X-Example': 'safe' },
    }]), [{
      method: 'GET',
      path: '/accounts',
      status: 200,
      headers: { 'x-example': 'safe' },
      body: undefined,
      latencyMs: 0,
    }]);
    assert.throws(() => normalizeLabMockRoutes([{
      method: 'GET',
      path: '/accounts',
      status: 200,
      headers: { authorization: 'secret' },
    }]));
    assert.throws(() => normalizeLabMockRoutes([
      { method: 'GET', path: '/accounts', status: 200 },
      { method: 'GET', path: '/accounts', status: 201 },
    ]));
  });
});
