import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPublicTarget,
  isPublicAddress,
  safeRequestHeaders,
  safeResponseHeaders,
  withoutRequestBodyHeaders,
} from '../src/security.js';

describe('lab egress security', () => {
  it('blocks local, private, link-local, multicast, and metadata network ranges', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) {
      assert.equal(isPublicAddress(address), false, address);
    }
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  });

  it('removes credentials, cookies, identity, forwarding, and hop headers', () => {
    assert.deepEqual(safeRequestHeaders({
      accept: 'application/json', authorization: 'Bearer secret', cookie: 'session=secret',
      'x-gateway-client-cert-sha256': 'fingerprint', 'x-forwarded-for': '127.0.0.1',
    }), { accept: 'application/json' });
    assert.deepEqual(safeResponseHeaders({
      'content-type': 'application/json', 'set-cookie': 'secret=1', 'content-length': '20',
    }), { 'content-type': 'application/json' });
  });

  it('builds the target under the configured public base path', () => {
    assert.equal(
      buildPublicTarget('https://api.example.com/v1', '/accounts/1?expand=true').toString(),
      'https://api.example.com/v1/accounts/1?expand=true',
    );
  });

  it('removes entity headers when a redirect changes the request to GET', () => {
    assert.deepEqual(withoutRequestBodyHeaders({
      accept: 'application/json',
      'content-length': '24',
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    }), { accept: 'application/json' });
  });
});
