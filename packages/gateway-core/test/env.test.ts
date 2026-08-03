import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadEnv } from '../src/config/env';

describe('gateway environment', () => {
  it('applies documented defaults and coerces PORT', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/gateway',
      PORT: '4100',
    });

    assert.equal(env.PORT, 4100);
    assert.equal(env.HOST, '0.0.0.0');
    assert.equal(env.REDIS_URL, 'redis://localhost:6379');
    assert.equal(env.LOG_LEVEL, 'info');
    assert.ok(env.GATEWAY_INSTANCE_ID.length > 0);
    assert.equal(env.GATEWAY_CONFIG_RECONCILE_SECONDS, 10);
  });

  it('rejects missing or malformed required configuration', () => {
    assert.throws(() => loadEnv({}), /DATABASE_URL/);
    assert.throws(
      () => loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/gateway',
        PORT: '70000',
      }),
      /less than or equal to 65535/,
    );
    assert.throws(
      () => loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/gateway',
        REDIS_URL: 'https://redis.example.com',
      }),
      /redis:\/\/ or rediss:\/\//,
    );
    assert.throws(
      () => loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/gateway',
        GATEWAY_CONFIG_RECONCILE_SECONDS: '61',
      }),
      /less than or equal to 60/,
    );
  });

  it('requires security configuration outside tests', () => {
    assert.throws(
      () => loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/gateway',
      }),
      /OAUTH_SIGNING_PRIVATE_KEY_BASE64 is required outside tests/,
    );

    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/gateway',
      GATEWAY_ENVIRONMENT_ALLOWLIST: 'env-qual-es, env-prod-es',
      OAUTH_SIGNING_PRIVATE_KEY_BASE64: 'placeholder',
      OAUTH_SIGNING_KEY_ID: 'gateway-1',
      MTLS_TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    });

    assert.deepEqual(env.GATEWAY_ENVIRONMENT_ALLOWLIST, [
      'env-qual-es',
      'env-prod-es',
    ]);
  });
});
