import {
  ProxyBundleError,
  ProxyDeploymentError,
  ProxyRevisionError,
} from '@api-gateway/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ProxyRevisionOperations } from '../services/proxy-revisions.js';

const MAX_BUNDLE_FILE_SIZE = 5 * 1024 * 1024;
const createProxySchema = z.object({
  name: z.string().trim().min(1).max(120),
}).strict();
const updateProxySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, {
  message: 'At least one proxy field is required',
});
const deploymentRevisionParamsSchema = z.object({
  proxyId: z.string().trim().min(1),
  revisionNumber: z.coerce.number().int().positive(),
});
const deployRevisionSchema = z.object({
  environmentId: z.string().trim().min(1).max(120),
  upstreamBaseUrl: z.string().url().nullable().optional(),
}).strict();

function sendDomainError(reply: FastifyReply, error: unknown) {
  if (error instanceof ProxyBundleError) {
    return reply.code(400).send({ error: error.code, message: error.message });
  }
  if (error instanceof ProxyRevisionError) {
    const statusCode = error.code.endsWith('_not_found') ? 404 : 409;
    return reply.code(statusCode).send({ error: error.code, message: error.message });
  }
  if (error instanceof ProxyDeploymentError) {
    const statusCode = error.code.endsWith('_not_found')
      ? 404
      : error.code === 'upstream_required' ? 400 : 409;
    return reply.code(statusCode).send({ error: error.code, message: error.message });
  }
  throw error;
}

async function readBundleFiles(request: FastifyRequest) {
  const files = new Map<string, string>();
  for await (const part of request.parts({
    limits: { files: 2, fields: 0, fileSize: MAX_BUNDLE_FILE_SIZE },
  })) {
    if (part.type !== 'file') continue;
    if (!['openapi', 'gateway'].includes(part.fieldname)) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Unexpected multipart file field ${part.fieldname}`,
      );
    }
    if (files.has(part.fieldname)) {
      throw new ProxyBundleError(
        'invalid_gateway_config',
        `Multipart field ${part.fieldname} must be provided once`,
      );
    }
    files.set(part.fieldname, (await part.toBuffer()).toString('utf8'));
  }
  const openapiSource = files.get('openapi');
  const gatewayConfigSource = files.get('gateway');
  if (!openapiSource || !gatewayConfigSource) {
    throw new ProxyBundleError(
      'invalid_gateway_config',
      'Multipart fields openapi and gateway are required',
    );
  }
  return { openapiSource, gatewayConfigSource };
}

export function registerProxyRevisionRoutes(
  server: FastifyInstance,
  revisions: ProxyRevisionOperations,
): void {
  server.post<{
    Params: { organizationId: string };
    Body: unknown;
  }>('/v1/organizations/:organizationId/proxies', async (request, reply) => {
    const parsed = createProxySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Proxy creation request is invalid',
        details: parsed.error.flatten(),
      });
    }
    try {
      const proxy = await revisions.createProxy(
        request.params.organizationId,
        parsed.data,
        request.adminPrincipal,
      );
      return reply.code(201).send(proxy);
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  server.patch<{
    Params: { proxyId: string };
    Body: unknown;
  }>('/v1/proxies/:proxyId', request => revisions.updateProxy(
    request.params.proxyId,
    updateProxySchema.parse(request.body),
    request.adminPrincipal,
  ));

  server.post<{ Params: { proxyId: string } }>(
    '/v1/proxies/:proxyId/revisions',
    async (request, reply) => {
      try {
        const files = await readBundleFiles(request);
        const revision = await revisions.importRevision(
          request.params.proxyId,
          files,
          request.adminPrincipal,
        );
        return reply.code(201).send(revision);
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );

  server.get<{ Params: { proxyId: string } }>(
    '/v1/proxies/:proxyId/revisions',
    request => revisions.listRevisions(request.params.proxyId, request.adminPrincipal),
  );

  server.get<{ Params: { proxyId: string; revisionNumber: string } }>(
    '/v1/proxies/:proxyId/revisions/:revisionNumber',
    async (request, reply) => {
      const parsed = deploymentRevisionParamsSchema.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
      return revisions.getRevision(
        parsed.data.proxyId,
        parsed.data.revisionNumber,
        request.adminPrincipal,
      );
    },
  );

  for (const source of ['openapi', 'gateway-config'] as const) {
    server.get<{ Params: { proxyId: string; revisionNumber: string } }>(
      `/v1/proxies/:proxyId/revisions/:revisionNumber/${source}`,
      async (request, reply) => {
        const parsed = deploymentRevisionParamsSchema.safeParse(request.params);
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
        const content = await revisions.getRevisionSource(
          parsed.data.proxyId,
          parsed.data.revisionNumber,
          source === 'openapi' ? 'openapi' : 'gateway',
          request.adminPrincipal,
        );
        return reply
          .type(content.trimStart().startsWith('{') ? 'application/json' : 'application/yaml')
          .send(content);
      },
    );
  }

  server.post<{
    Params: { proxyId: string; revisionNumber: string };
    Body: unknown;
  }>('/v1/proxies/:proxyId/revisions/:revisionNumber/deployments', async (request, reply) => {
    const params = deploymentRevisionParamsSchema.safeParse(request.params);
    const body = deployRevisionSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Proxy deployment request is invalid',
      });
    }
    try {
      const deployment = await revisions.deployRevision(
        params.data.proxyId,
        params.data.revisionNumber,
        body.data,
        request.adminPrincipal,
      );
      return reply.code(201).send({
        deployment,
        runtimeRefreshRequired: true,
      });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  });

  server.post<{ Params: { deploymentId: string } }>(
    '/v1/proxy-deployments/:deploymentId/retire',
    async (request, reply) => {
      try {
        const deployment = await revisions.retireDeployment(
          request.params.deploymentId,
          request.adminPrincipal,
        );
        return reply.send({ deployment, runtimeRefreshRequired: true });
      } catch (error) {
        return sendDomainError(reply, error);
      }
    },
  );
}
