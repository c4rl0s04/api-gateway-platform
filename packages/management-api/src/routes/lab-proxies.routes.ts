import {
  LabUpstreamError,
  ProxyBundleError,
  ProxyDeploymentError,
  ProxyRevisionError,
} from '@api-gateway/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { LabProxyOperations } from '../services/lab-proxies.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const nameSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const revisionParams = z.object({
  proxyId: z.string().trim().min(1),
  revisionNumber: z.coerce.number().int().positive(),
});
const deploySchema = z.object({
  environmentId: z.string().trim().min(1).max(120),
  upstreamId: z.string().trim().min(1).max(120),
}).strict();

async function readBundle(
  request: FastifyRequest,
  options: { allowName: boolean; requireGateway: boolean },
) {
  const files = new Map<string, string>();
  let name: string | undefined;
  for await (const part of request.parts({
    limits: { files: 2, fields: options.allowName ? 1 : 0, fileSize: MAX_FILE_SIZE },
  })) {
    if (part.type === 'field') {
      if (!options.allowName || part.fieldname !== 'name' || name !== undefined) {
        throw Object.assign(new Error(`Unexpected multipart field ${part.fieldname}`), { statusCode: 400 });
      }
      name = String(part.value);
      continue;
    }
    if (!['openapi', 'gateway'].includes(part.fieldname) || files.has(part.fieldname)) {
      throw Object.assign(new Error(`Unexpected multipart file ${part.fieldname}`), { statusCode: 400 });
    }
    files.set(part.fieldname, (await part.toBuffer()).toString('utf8'));
  }
  const openapiSource = files.get('openapi');
  const gatewayConfigSource = files.get('gateway');
  if (!openapiSource) throw new ProxyBundleError('invalid_openapi', 'Multipart field openapi is required');
  if (options.requireGateway && !gatewayConfigSource) {
    throw new ProxyBundleError('invalid_gateway_config', 'Multipart field gateway is required');
  }
  return { name, openapiSource, gatewayConfigSource };
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof LabUpstreamError) {
    return reply.code(error.code === 'lab_resource_not_found' ? 404 : 400)
      .send({ error: error.code, message: error.message });
  }
  if (error instanceof ProxyBundleError) {
    return reply.code(400).send({ error: error.code, message: error.message });
  }
  if (error instanceof ProxyRevisionError || error instanceof ProxyDeploymentError) {
    const status = error.code.endsWith('_not_found') ? 404 : 409;
    return reply.code(status).send({ error: error.code, message: error.message });
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 403 || statusCode === 404) {
    return reply.code(404).send({
      error: 'lab_resource_not_found',
      message: 'Lab resource does not exist',
    });
  }
  throw error;
}

function runtimeResult(value: unknown) {
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.configVersion !== 'number') throw new Error('Missing runtime version');
  const { configVersion, ...resource } = candidate;
  return {
    resource,
    runtimeRefreshRequired: false,
    runtimeSync: { version: configVersion, state: 'queued' },
  };
}

export function registerLabProxyRoutes(server: FastifyInstance, proxies: LabProxyOperations): void {
  server.get('/lab/v1/proxies', request => proxies.list(request.labPrincipal));
  server.get<{ Params: { proxyId: string } }>('/lab/v1/proxies/:proxyId', async (request, reply) => {
    try { return await proxies.get(request.params.proxyId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Body: unknown }>('/lab/v1/proxies', async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    return reply.code(201).send(await proxies.create(parsed.data, request.labPrincipal));
  });
  server.post('/lab/v1/proxy-configurations/validate', async (request, reply) => {
    try {
      const bundle = await readBundle(request, { allowName: false, requireGateway: false });
      return await proxies.validate(bundle, request.labPrincipal);
    } catch (error) { return sendError(reply, error); }
  });
  server.post('/lab/v1/proxies/configured', async (request, reply) => {
    try {
      const bundle = await readBundle(request, { allowName: true, requireGateway: true });
      const parsed = nameSchema.parse({ name: bundle.name });
      return reply.code(201).send(await proxies.createConfigured({
        name: parsed.name,
        openapiSource: bundle.openapiSource,
        gatewayConfigSource: bundle.gatewayConfigSource!,
      }, request.labPrincipal));
    } catch (error) { return sendError(reply, error); }
  });
  server.patch<{ Params: { proxyId: string }; Body: unknown }>('/lab/v1/proxies/:proxyId', async (request, reply) => {
    try {
      return await proxies.update(request.params.proxyId, updateSchema.parse(request.body), request.labPrincipal);
    } catch (error) { return sendError(reply, error); }
  });
  server.post<{ Params: { proxyId: string } }>('/lab/v1/proxies/:proxyId/revisions', async (request, reply) => {
    try {
      const bundle = await readBundle(request, { allowName: false, requireGateway: true });
      return reply.code(201).send(await proxies.importRevision(request.params.proxyId, {
        openapiSource: bundle.openapiSource,
        gatewayConfigSource: bundle.gatewayConfigSource!,
      }, request.labPrincipal));
    } catch (error) { return sendError(reply, error); }
  });
  server.get<{ Params: { proxyId: string } }>('/lab/v1/proxies/:proxyId/revisions', async (request, reply) => {
    try { return await proxies.listRevisions(request.params.proxyId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.get<{ Params: { proxyId: string; revisionNumber: string } }>('/lab/v1/proxies/:proxyId/revisions/:revisionNumber', async (request, reply) => {
    const params = revisionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_request' });
    try { return await proxies.getRevision(params.data.proxyId, params.data.revisionNumber, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.get<{ Params: { proxyId: string } }>('/lab/v1/proxies/:proxyId/deployments', async (request, reply) => {
    try { return await proxies.listDeployments(request.params.proxyId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Params: { proxyId: string; revisionNumber: string }; Body: unknown }>(
    '/lab/v1/proxies/:proxyId/revisions/:revisionNumber/deployments',
    async (request, reply) => {
      const params = revisionParams.safeParse(request.params);
      const body = deploySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_request' });
      try {
        const result = runtimeResult(await proxies.deploy(
          params.data.proxyId,
          params.data.revisionNumber,
          body.data,
          request.labPrincipal,
        ));
        return reply.code(201).send({
          deployment: result.resource,
          runtimeRefreshRequired: result.runtimeRefreshRequired,
          runtimeSync: result.runtimeSync,
        });
      } catch (error) { return sendError(reply, error); }
    },
  );
  server.post<{ Params: { deploymentId: string } }>('/lab/v1/deployments/:deploymentId/retire', async (request, reply) => {
    try {
      const result = runtimeResult(await proxies.retire(request.params.deploymentId, request.labPrincipal));
      return {
        deployment: result.resource,
        runtimeRefreshRequired: result.runtimeRefreshRequired,
        runtimeSync: result.runtimeSync,
      };
    } catch (error) { return sendError(reply, error); }
  });
}
