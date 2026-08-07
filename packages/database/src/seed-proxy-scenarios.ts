type SeedPolicyType =
  | 'api-key-auth'
  | 'oauth-token'
  | 'oauth-access-token'
  | 'jwks-endpoint'
  | 'mtls-auth'
  | 'rate-limit';

export interface SeedPolicy {
  type: SeedPolicyType;
  enabled?: boolean;
  config: Record<string, unknown>;
}

export interface SeedOperation {
  operationId: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  targetPath?: string;
  mode?: 'local';
  /** Undefined inherits revision defaults; [] explicitly makes the operation public. */
  policies?: SeedPolicy[];
}

export interface SeedRevision {
  apiVersion: string;
  basePath: string;
  defaults?: SeedPolicy[];
  operations: SeedOperation[];
}

export interface SeedDeploymentEvent {
  key: string;
  revision: number;
  environmentId: string;
}

export interface ProxySeedScenario {
  proxyId: string;
  systemManaged?: boolean;
  revisions: SeedRevision[];
  deployments?: SeedDeploymentEvent[];
  deployLatestToAllEnvironments?: boolean;
}

function pathParameters(path: string) {
  return [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

export function buildSeedRevisionSources(
  proxyId: string,
  revision: SeedRevision,
) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of revision.operations) {
    paths[operation.path] ??= {};
    paths[operation.path][operation.method] = {
      operationId: operation.operationId,
      parameters: pathParameters(operation.path),
      responses: { '200': { description: 'Development seed response' } },
    };
  }
  return {
    openapiSource: JSON.stringify({
      openapi: '3.1.0',
      info: { title: proxyId, version: revision.apiVersion },
      paths,
    }, null, 2),
    gatewayConfigSource: JSON.stringify({
      apiVersion: 'gateway.platform/v1',
      basePath: revision.basePath,
      ...(revision.defaults === undefined
        ? {}
        : { defaults: { policies: revision.defaults } }),
      operations: Object.fromEntries(revision.operations.map(operation => [
        operation.operationId,
        {
          ...(operation.mode ? { mode: operation.mode } : {}),
          ...(operation.targetPath ? { targetPath: operation.targetPath } : {}),
          ...(operation.policies === undefined
            ? {}
            : { policies: operation.policies }),
        },
      ])),
    }, null, 2),
  };
}

const closedApiKey = (header = 'x-api-key'): SeedPolicy => ({
  type: 'api-key-auth',
  config: { header, failureMode: 'closed' },
});

const rateLimit = (
  limit: number,
  windowSeconds = 60,
  failureMode: 'open' | 'closed' = 'closed',
): SeedPolicy => ({
  type: 'rate-limit',
  config: { limit, windowSeconds, failureMode },
});

const bearer = (...requiredScopes: string[]): SeedPolicy => ({
  type: 'oauth-access-token',
  config: {
    audience: 'api-gateway',
    requiredScopes,
    failureMode: 'closed',
  },
});

const mtls: SeedPolicy = {
  type: 'mtls-auth',
  config: { failureMode: 'closed' },
};

const environment = (stage: 'qual' | 'pprod' | 'prod', region: string) =>
  `env-${stage}-${region}`;

export const PROXY_SEED_SCENARIOS: ProxySeedScenario[] = [
  {
    proxyId: 'proxy-platform-oauth',
    systemManaged: true,
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/oauth',
      operations: [
        {
          operationId: 'ep-oauth-token',
          method: 'post',
          path: '/token',
          mode: 'local',
          policies: [
            rateLimit(30),
            {
              type: 'oauth-token',
              config: {
                failureMode: 'closed',
                grantTypes: [
                  'client_credentials',
                  'urn:ietf:params:oauth:grant-type:jwt-bearer',
                ],
                accessTokenTtlSeconds: 900,
                audience: 'api-gateway',
                allowedScopes: [
                  'banking:read',
                  'banking:write',
                  'identity:read',
                  'logistics:read',
                  'commerce:read',
                  'commerce:write',
                  'healthcare:read',
                  'iot:read',
                  'streaming:read',
                  'gaming:read',
                ],
              },
            },
          ],
        },
        {
          operationId: 'ep-oauth-jwks',
          method: 'get',
          path: '/.well-known/jwks.json',
          mode: 'local',
          policies: [{
            type: 'jwks-endpoint',
            config: { failureMode: 'closed' },
          }],
        },
      ],
    }],
    deployLatestToAllEnvironments: true,
  },
  {
    proxyId: 'proxy-es-banking',
    revisions: [
      {
        apiVersion: '1.0.0',
        basePath: '/es/banking/v1',
        operations: [
          { operationId: 'ep-esb-health', method: 'get', path: '/health', targetPath: '/health', policies: [mtls] },
          { operationId: 'ep-esb-accounts', method: 'get', path: '/accounts', targetPath: '/accounts', policies: [closedApiKey(), rateLimit(5, 60, 'open')] },
          { operationId: 'ep-esb-acc-id', method: 'get', path: '/accounts/{id}', targetPath: '/accounts/{id}', policies: [bearer('banking:read')] },
        ],
      },
      {
        apiVersion: '1.1.0',
        basePath: '/es/banking/v1',
        defaults: [closedApiKey()],
        operations: [
          { operationId: 'ep-esb-health', method: 'get', path: '/health', targetPath: '/health', policies: [mtls] },
          { operationId: 'ep-esb-status', method: 'get', path: '/status', targetPath: '/health', policies: [closedApiKey()] },
          { operationId: 'ep-esb-accounts', method: 'get', path: '/accounts', targetPath: '/accounts' },
          { operationId: 'ep-esb-accounts-create', method: 'post', path: '/accounts', targetPath: '/accounts', policies: [bearer('banking:write'), rateLimit(10)] },
          { operationId: 'ep-esb-acc-id', method: 'get', path: '/accounts/{id}', targetPath: '/accounts/{id}', policies: [bearer('banking:read')] },
          { operationId: 'ep-esb-summary', method: 'get', path: '/accounts-summary', targetPath: '/accounts', policies: [closedApiKey(), rateLimit(20)] },
        ],
      },
      {
        apiVersion: '2.0.0',
        basePath: '/es/banking/v2',
        defaults: [bearer('banking:read')],
        operations: [
          { operationId: 'ep-esb-v2-accounts', method: 'get', path: '/accounts', targetPath: '/accounts' },
          { operationId: 'ep-esb-v2-account', method: 'get', path: '/accounts/{id}', targetPath: '/accounts/{id}' },
        ],
      },
    ],
    deployments: [
      { key: 'es-banking-r1-qual', revision: 1, environmentId: environment('qual', 'es') },
      { key: 'es-banking-r2-qual', revision: 2, environmentId: environment('qual', 'es') },
      { key: 'es-banking-r2-pprod', revision: 2, environmentId: environment('pprod', 'es') },
    ],
  },
  {
    proxyId: 'proxy-us-banking',
    revisions: [
      {
        apiVersion: '2.0.0',
        basePath: '/us/banking/v2',
        operations: [
          { operationId: 'ep-usb-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
          { operationId: 'ep-usb-cards', method: 'get', path: '/cards', targetPath: '/cards', policies: [closedApiKey()] },
          { operationId: 'ep-usb-card-id', method: 'get', path: '/cards/{id}', targetPath: '/cards/{id}', policies: [closedApiKey()] },
        ],
      },
      {
        apiVersion: '2.1.0',
        basePath: '/us/banking/v2',
        defaults: [closedApiKey('x-partner-key'), rateLimit(100, 300)],
        operations: [
          { operationId: 'ep-usb-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
          { operationId: 'ep-usb-cards', method: 'get', path: '/cards', targetPath: '/cards' },
          { operationId: 'ep-usb-card-id', method: 'get', path: '/cards/{id}', targetPath: '/cards/{id}', policies: [bearer('banking:read')] },
        ],
      },
    ],
    deployments: [
      { key: 'us-banking-r1-qual', revision: 1, environmentId: environment('qual', 'us') },
      { key: 'us-banking-r2-qual', revision: 2, environmentId: environment('qual', 'us') },
    ],
  },
  {
    proxyId: 'proxy-uk-logistics',
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/uk/logistics/v1',
      defaults: [closedApiKey()],
      operations: [
        { operationId: 'ep-ukl-health', method: 'get', path: '/health', targetPath: '/health', policies: [closedApiKey()] },
        { operationId: 'ep-ukl-shipments', method: 'get', path: '/shipments', targetPath: '/shipments' },
        { operationId: 'ep-ukl-ship-id', method: 'get', path: '/shipments/{id}', targetPath: '/shipments/{id}', policies: [bearer('logistics:read')] },
      ],
    }],
    deployments: [
      { key: 'uk-logistics-r1-qual', revision: 1, environmentId: environment('qual', 'uk') },
      { key: 'uk-logistics-r1-pprod', revision: 1, environmentId: environment('pprod', 'uk') },
      { key: 'uk-logistics-r1-prod', revision: 1, environmentId: environment('prod', 'uk') },
    ],
  },
  {
    proxyId: 'proxy-fr-ecommerce',
    revisions: [
      {
        apiVersion: '1.0.0',
        basePath: '/fr/ecommerce/v1',
        operations: [
          { operationId: 'ep-fre-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
          { operationId: 'ep-fre-products', method: 'get', path: '/products', targetPath: '/products', policies: [closedApiKey()] },
          { operationId: 'ep-fre-product-id', method: 'get', path: '/products/{id}', targetPath: '/products/{id}', policies: [closedApiKey()] },
        ],
      },
      {
        apiVersion: '1.1.0',
        basePath: '/fr/ecommerce/v1',
        defaults: [bearer('commerce:read')],
        operations: [
          { operationId: 'ep-fre-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
          { operationId: 'ep-fre-products', method: 'get', path: '/products', targetPath: '/products' },
          { operationId: 'ep-fre-product-id', method: 'get', path: '/products/{id}', targetPath: '/products/{id}' },
        ],
      },
    ],
    deployments: [
      { key: 'fr-ecommerce-r1-qual', revision: 1, environmentId: environment('qual', 'fr') },
      { key: 'fr-ecommerce-r2-qual', revision: 2, environmentId: environment('qual', 'fr') },
      { key: 'fr-ecommerce-r1-rollback', revision: 1, environmentId: environment('qual', 'fr') },
    ],
  },
  {
    proxyId: 'proxy-es-ecommerce',
    revisions: [
      {
        apiVersion: '2.0.0',
        basePath: '/es/ecommerce/v2',
        operations: [
          { operationId: 'ep-ese-health', method: 'get', path: '/health', targetPath: '/health', policies: [closedApiKey()] },
          { operationId: 'ep-ese-orders', method: 'get', path: '/orders', targetPath: '/orders', policies: [closedApiKey(), rateLimit(60, 60, 'open')] },
          { operationId: 'ep-ese-order-id', method: 'get', path: '/orders/{id}', targetPath: '/orders/{id}', policies: [closedApiKey()] },
        ],
      },
      {
        apiVersion: '2.1.0',
        basePath: '/es/ecommerce/v2',
        defaults: [bearer('commerce:read')],
        operations: [
          { operationId: 'ep-ese-health', method: 'get', path: '/health', targetPath: '/health', policies: [closedApiKey()] },
          { operationId: 'ep-ese-orders', method: 'get', path: '/orders', targetPath: '/orders' },
          { operationId: 'ep-ese-order-id', method: 'get', path: '/orders/{id}', targetPath: '/orders/{id}' },
        ],
      },
    ],
    deployments: [
      { key: 'es-ecommerce-r1-qual', revision: 1, environmentId: environment('qual', 'es') },
      { key: 'es-ecommerce-r2-qual', revision: 2, environmentId: environment('qual', 'es') },
    ],
  },
  {
    proxyId: 'proxy-de-healthcare',
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/de/healthcare/v1',
      defaults: [bearer('healthcare:read')],
      operations: [
        { operationId: 'ep-deh-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
        { operationId: 'ep-deh-patients', method: 'get', path: '/patients', targetPath: '/patients' },
        { operationId: 'ep-deh-patient-id', method: 'get', path: '/patients/{id}', targetPath: '/patients/{id}' },
      ],
    }],
    deployments: [{ key: 'de-healthcare-r1-qual', revision: 1, environmentId: environment('qual', 'de') }],
  },
  {
    proxyId: 'proxy-us-identity',
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/us/identity/v1',
      operations: [
        { operationId: 'ep-usi-health', method: 'get', path: '/health', targetPath: '/health', policies: [closedApiKey()] },
        { operationId: 'ep-usi-users', method: 'get', path: '/users', targetPath: '/users', policies: [closedApiKey()] },
        { operationId: 'ep-usi-user-id', method: 'get', path: '/users/{id}', targetPath: '/users/{id}', policies: [bearer('identity:read')] },
      ],
    }],
    deployments: [{ key: 'us-identity-r1-qual', revision: 1, environmentId: environment('qual', 'us') }],
  },
  {
    proxyId: 'proxy-jp-iot',
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/jp/iot/v1',
      defaults: [bearer('iot:read'), rateLimit(120, 60, 'closed')],
      operations: [
        { operationId: 'ep-jpi-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
        { operationId: 'ep-jpi-devices', method: 'get', path: '/devices', targetPath: '/devices' },
        { operationId: 'ep-jpi-device-id', method: 'get', path: '/devices/{id}', targetPath: '/devices/{id}' },
      ],
    }],
    deployments: [{ key: 'jp-iot-r1-qual', revision: 1, environmentId: environment('qual', 'jp') }],
  },
  {
    proxyId: 'proxy-br-streaming',
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/br/streaming/v1',
      operations: [
        { operationId: 'ep-brs-health', method: 'get', path: '/health', targetPath: '/health', policies: [closedApiKey()] },
        { operationId: 'ep-brs-catalog', method: 'get', path: '/catalog', targetPath: '/catalog', policies: [closedApiKey(), rateLimit(200, 60, 'open')] },
        { operationId: 'ep-brs-catalog-id', method: 'get', path: '/catalog/{id}', targetPath: '/catalog/{id}', policies: [closedApiKey(), { ...rateLimit(20), enabled: false }] },
      ],
    }],
    deployments: [{ key: 'br-streaming-r1-qual', revision: 1, environmentId: environment('qual', 'br') }],
  },
  {
    proxyId: 'proxy-kr-gaming',
    revisions: [{
      apiVersion: '1.0.0',
      basePath: '/kr/gaming/v1',
      defaults: [closedApiKey(), rateLimit(30, 60, 'closed')],
      operations: [
        { operationId: 'ep-krg-ping', method: 'get', path: '/ping', targetPath: '/ping', policies: [closedApiKey()] },
        { operationId: 'ep-krg-leaderboards', method: 'get', path: '/leaderboards', targetPath: '/leaderboards' },
        { operationId: 'ep-krg-leaderboard-id', method: 'get', path: '/leaderboards/{id}', targetPath: '/leaderboards/{id}' },
      ],
    }],
    deployments: [{ key: 'kr-gaming-r1-qual', revision: 1, environmentId: environment('qual', 'kr') }],
  },
];
