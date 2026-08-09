import {
  ApplicationManagementError,
  RegisterDeveloperApplicationError,
} from '@api-gateway/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { LabApplicationOperations } from '../services/lab-applications.js';

const productGrant = z.object({
  productId: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
}).strict();
const products = z.array(productGrant).min(1).max(100).refine(
  value => new Set(value.map(product => product.productId)).size === value.length,
  'Product IDs must be unique',
);
const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  products,
}).strict();
const appUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['pending', 'approved', 'revoked']).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const createCredentialSchema = z.union([
  z.object({
    products,
    expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
  }).strict(),
  z.object({
    sourceCredentialId: z.string().trim().min(1).max(120),
    expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).optional(),
  }).strict(),
]);
const credentialUpdateSchema = z.object({
  consumerKey: z.string().trim().min(1).max(120).refine(
    value => !/[\s:\u0000-\u001f\u007f]/u.test(value),
    'Consumer key cannot contain whitespace, colons, or control characters',
  ).optional(),
  expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
  status: z.enum(['pending', 'approved', 'revoked']).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const publicKeySchema = z.object({
  kid: z.string().trim().min(1).max(120),
  jwk: z.record(z.unknown()),
  validFrom: z.string().datetime({ offset: true }).transform(value => new Date(value)).optional(),
  expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value)).nullable().optional(),
}).strict();

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof RegisterDeveloperApplicationError
    || error instanceof ApplicationManagementError) {
    const missing = error.code.endsWith('_not_found');
    return reply.code(missing ? 404 : error.code.endsWith('_conflict') ? 409 : 400).send({
      error: missing ? 'lab_resource_not_found' : error.code,
      message: error.message,
    });
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode === 403 || statusCode === 404) {
    return reply.code(404).send({ error: 'lab_resource_not_found', message: 'Lab resource does not exist' });
  }
  throw error;
}

export function registerLabApplicationRoutes(
  server: FastifyInstance,
  applications: LabApplicationOperations,
): void {
  server.get('/lab/v1/apps', request => applications.list(request.labPrincipal));
  server.get<{ Params: { appId: string } }>('/lab/v1/apps/:appId', async (request, reply) => {
    try { return await applications.get(request.params.appId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Body: unknown }>('/lab/v1/apps', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    try { return reply.code(201).send(await applications.register(parsed.data, request.labPrincipal)); }
    catch (error) { return sendError(reply, error); }
  });
  server.patch<{ Params: { appId: string }; Body: unknown }>('/lab/v1/apps/:appId', async (request, reply) => {
    const parsed = appUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    try { return await applications.update(request.params.appId, parsed.data, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Params: { appId: string }; Body: unknown }>('/lab/v1/apps/:appId/credentials', async (request, reply) => {
    const parsed = createCredentialSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    try { return reply.code(201).send(await applications.createCredential(request.params.appId, parsed.data, request.labPrincipal)); }
    catch (error) { return sendError(reply, error); }
  });
  server.get<{ Params: { credentialId: string } }>('/lab/v1/credentials/:credentialId', async (request, reply) => {
    try { return await applications.getCredential(request.params.credentialId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.patch<{ Params: { credentialId: string }; Body: unknown }>('/lab/v1/credentials/:credentialId', async (request, reply) => {
    const parsed = credentialUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    try { return await applications.updateCredential(request.params.credentialId, parsed.data, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Params: { credentialId: string } }>('/lab/v1/credentials/:credentialId/rotate-secret', async (request, reply) => {
    try { return await applications.rotateCredential(request.params.credentialId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.put<{ Params: { credentialId: string }; Body: unknown }>('/lab/v1/credentials/:credentialId/grants', async (request, reply) => {
    const parsed = z.object({ products: z.array(productGrant).max(100) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    try { return await applications.replaceGrants(request.params.credentialId, parsed.data.products, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.get<{ Params: { credentialId: string } }>('/lab/v1/credentials/:credentialId/public-keys', async (request, reply) => {
    try { return await applications.listPublicKeys(request.params.credentialId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
  server.post<{ Params: { credentialId: string }; Body: unknown }>('/lab/v1/credentials/:credentialId/public-keys', async (request, reply) => {
    const parsed = publicKeySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.flatten() });
    try {
      return reply.code(201).send(await applications.registerPublicKey(
        request.params.credentialId,
        parsed.data as Parameters<LabApplicationOperations['registerPublicKey']>[1],
        request.labPrincipal,
      ));
    } catch (error) { return sendError(reply, error); }
  });
  server.post<{ Params: { publicKeyId: string } }>('/lab/v1/public-keys/:publicKeyId/revoke', async (request, reply) => {
    try { return await applications.revokePublicKey(request.params.publicKeyId, request.labPrincipal); }
    catch (error) { return sendError(reply, error); }
  });
}
