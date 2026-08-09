import { randomUUID } from 'node:crypto';
import { prisma, type LabPrincipal } from '@api-gateway/database';
import type { LabApplicationOperations } from './lab-applications.js';
import type { LabProductOperations } from './lab-products.js';
import type { LabProxyOperations } from './lab-proxies.js';
import type { LabUpstreamOperations } from './lab-upstreams.js';

export interface LabExampleProvisioner {
  provision(principal: LabPrincipal): Promise<unknown>;
}

export interface LabEnvironmentSelection {
  id: string;
  stage: 'qual';
  region: string;
}

async function defaultEnvironment(): Promise<LabEnvironmentSelection> {
  const selected = await prisma.environment.findFirst({
    where: { stage: 'qual', region: 'es' },
    select: { id: true, stage: true, region: true },
  }) ?? await prisma.environment.findFirstOrThrow({
    where: { stage: 'qual' },
    orderBy: { region: 'asc' },
    select: { id: true, stage: true, region: true },
  });
  return { id: selected.id, stage: 'qual', region: selected.region };
}

export class LabExampleService implements LabExampleProvisioner {
  constructor(
    private readonly upstreams: LabUpstreamOperations,
    private readonly proxies: LabProxyOperations,
    private readonly products: LabProductOperations,
    private readonly applications: LabApplicationOperations,
    private readonly selectEnvironment: () => Promise<LabEnvironmentSelection> = defaultEnvironment,
  ) {}

  async provision(principal: LabPrincipal) {
    const environment = await this.selectEnvironment();
    const suffix = randomUUID().slice(0, 8);
    const upstream = await this.upstreams.create({
      name: `Sample Banking Mock ${suffix}`,
      kind: 'mock',
      routes: [
        {
          method: 'GET',
          path: '/accounts',
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { accounts: [{ id: 'account-1001', currency: 'EUR', balance: 1250 }] },
        },
        {
          method: 'POST',
          path: '/transfers',
          status: 201,
          headers: { 'content-type': 'application/json' },
          body: { id: 'transfer-1001', status: 'accepted' },
        },
        {
          method: 'GET',
          path: '/certificate-profile',
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { authenticated: true, method: 'mtls' },
        },
      ],
    }, principal) as { id: string };

    const openapiSource = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Sample Banking Proxy', version: '1.0.0' },
      paths: {
        '/accounts': {
          get: {
            operationId: 'listAccounts',
            responses: { '200': { description: 'Sample accounts' } },
          },
        },
        '/transfers': {
          post: {
            operationId: 'createTransfer',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  example: { from: 'account-1001', to: 'account-2002', amount: 25 },
                  schema: {
                    type: 'object',
                    required: ['from', 'to', 'amount'],
                    properties: {
                      from: { type: 'string' },
                      to: { type: 'string' },
                      amount: { type: 'number', minimum: 0.01 },
                    },
                  },
                },
              },
            },
            responses: { '201': { description: 'Transfer accepted' } },
          },
        },
        '/certificate-profile': {
          get: {
            operationId: 'certificateProfile',
            responses: { '200': { description: 'mTLS identity profile' } },
          },
        },
      },
    }, null, 2);
    const gatewayConfigSource = JSON.stringify({
      apiVersion: 'gateway.platform/v1',
      basePath: '/lab/banking/v1',
      operations: {
        listAccounts: {
          targetPath: '/accounts',
          policies: [
            { type: 'api-key-auth', config: { header: 'x-api-key', failureMode: 'closed' } },
            { type: 'rate-limit', config: { limit: 20, windowSeconds: 60, failureMode: 'closed' } },
          ],
        },
        createTransfer: {
          targetPath: '/transfers',
          policies: [
            {
              type: 'oauth-access-token',
              config: {
                audience: 'api-gateway',
                requiredScopes: ['banking:write'],
                failureMode: 'closed',
              },
            },
            { type: 'rate-limit', config: { limit: 10, windowSeconds: 60, failureMode: 'closed' } },
          ],
        },
        certificateProfile: {
          targetPath: '/certificate-profile',
          policies: [{ type: 'mtls-auth', config: { failureMode: 'closed' } }],
        },
      },
    }, null, 2);
    const configured = await this.proxies.createConfigured({
      name: 'Sample Banking Proxy',
      openapiSource,
      gatewayConfigSource,
    }, principal) as {
      proxy: { id: string };
      revision: { revisionNumber: number };
    };
    const deployment = await this.proxies.deploy(
      configured.proxy.id,
      configured.revision.revisionNumber,
      { environmentId: environment.id, upstreamId: upstream.id },
      principal,
    );
    const product = await this.products.create({
      name: 'Sample Banking Product',
      scopes: ['banking:read', 'banking:write'],
      proxyIds: [configured.proxy.id],
      environmentIds: [environment.id],
      active: true,
    }, principal) as { id: string };
    const application = await this.applications.register({
      name: 'Test Application',
      products: [{
        productId: product.id,
        scopes: ['banking:read', 'banking:write'],
      }],
    }, principal);
    return {
      upstream,
      proxy: configured.proxy,
      revision: configured.revision,
      deployment,
      product,
      application,
      environment,
    };
  }
}
