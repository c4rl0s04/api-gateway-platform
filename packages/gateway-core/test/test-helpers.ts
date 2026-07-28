import type { GatewayEnv } from '../src/config/env';
import type { PolicyContext } from '../src/policies/types';

export const TEST_ENV: GatewayEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3000,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  LOG_LEVEL: 'silent',
};

export function createPolicyContext(
  overrides: {
    headers?: Record<string, string>;
    proxyId?: string;
  } = {},
): {
  context: PolicyContext;
  responseHeaders: Map<string, string>;
  errors: unknown[];
} {
  const responseHeaders = new Map<string, string>();
  const errors: unknown[] = [];

  const context = {
    req: {
      headers: overrides.headers ?? {},
      ip: '127.0.0.1',
      id: 'test-request-id',
      log: {
        info: () => undefined,
        error: (value: unknown) => errors.push(value),
      },
    },
    reply: {
      header: (name: string, value: string) => {
        responseHeaders.set(name.toLowerCase(), value);
      },
    },
    proxy: {
      id: overrides.proxyId ?? 'proxy-test',
      name: 'Test proxy',
      basePath: '/test',
      deploymentId: 'deployment-test',
      environment: {
        id: 'env-qual-es',
        stage: 'qual',
        region: 'es',
        publicOrigin: 'https://qual-es.gateway.localhost:8443',
      },
      systemManaged: false,
      upstreamBaseUrl: 'http://localhost',
      organizationId: 'org-test',
      active: true,
      endpoints: [],
    },
    endpoint: {
      id: 'endpoint-test',
      mode: 'forward',
      path: '/resource',
      targetPath: '/resource',
      policies: [],
    },
    params: {},
    state: {},
  } as unknown as PolicyContext;

  return { context, responseHeaders, errors };
}
