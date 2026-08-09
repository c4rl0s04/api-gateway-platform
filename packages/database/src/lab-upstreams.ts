import { isIP } from 'node:net';
import {
  AdminRole,
  LabUpstreamKind,
  Prisma,
} from './generated/index.js';
import { prisma } from './client.js';

export type LabUpstreamErrorCode =
  | 'lab_resource_not_found'
  | 'lab_upstream_blocked'
  | 'lab_upstream_conflict';

export class LabUpstreamError extends Error {
  constructor(
    public readonly code: LabUpstreamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LabUpstreamError';
  }
}

export interface LabUpstreamActor {
  issuer: string;
  subject: string;
}

export interface LabMockRoute {
  method: string;
  path: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  latencyMs?: number;
}

export type CreateLabUpstreamInput = {
  workspaceId: string;
  name: string;
  active?: boolean;
  actor: LabUpstreamActor;
} & (
  | { kind: 'mock'; routes: LabMockRoute[] }
  | { kind: 'publicHttps'; targetUrl: string }
);

export type UpdateLabUpstreamInput = {
  upstreamId: string;
  workspaceId: string;
  name?: string;
  active?: boolean;
  actor: LabUpstreamActor;
} & (
  | { kind?: 'mock'; routes?: LabMockRoute[]; targetUrl?: never }
  | { kind?: 'publicHttps'; targetUrl?: string; routes?: never }
);

const forbiddenHeaderNames = new Set([
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-gateway-client-cert-sha256',
]);

function blockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/u.test(normalized)
    || normalized.startsWith('ff');
}

export function normalizeLabPublicHttpsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LabUpstreamError('lab_upstream_blocked', 'Upstream URL is invalid');
  }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) {
    throw new LabUpstreamError(
      'lab_upstream_blocked',
      'Public lab upstreams require HTTPS on port 443',
    );
  }
  if (url.username || url.password || url.hash) {
    throw new LabUpstreamError(
      'lab_upstream_blocked',
      'Upstream credentials and URL fragments are not allowed',
    );
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, '')
    .replace(/^\[|\]$/gu, '');
  const literalKind = isIP(hostname);
  if (hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === 'metadata.google.internal'
    || hostname === 'metadata.azure.internal'
    || (literalKind === 4 && blockedIpv4(hostname))
    || (literalKind === 6 && blockedIpv6(hostname))) {
    throw new LabUpstreamError(
      'lab_upstream_blocked',
      'Private, local, and metadata upstreams are not allowed',
    );
  }
  url.hostname = hostname.includes(':') ? `[${hostname}]` : hostname;
  url.port = '';
  return url.toString();
}

export function normalizeLabMockRoutes(routes: LabMockRoute[]): LabMockRoute[] {
  if (routes.length === 0 || routes.length > 100) {
    throw new LabUpstreamError(
      'lab_upstream_blocked',
      'A mock upstream requires between one and 100 routes',
    );
  }
  const seen = new Set<string>();
  return routes.map(route => {
    const method = route.method.trim().toUpperCase();
    const path = route.path.trim();
    const status = route.status;
    const latencyMs = route.latencyMs ?? 0;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)
      || !path.startsWith('/')
      || path.includes('?')
      || !Number.isInteger(status)
      || status < 100
      || status > 599
      || !Number.isInteger(latencyMs)
      || latencyMs < 0
      || latencyMs > 5_000) {
      throw new LabUpstreamError('lab_upstream_blocked', 'Mock route configuration is invalid');
    }
    const key = `${method} ${path}`;
    if (seen.has(key)) {
      throw new LabUpstreamError('lab_upstream_conflict', `Duplicate mock route ${key}`);
    }
    seen.add(key);
    const headers = Object.fromEntries(Object.entries(route.headers ?? {}).map(([name, value]) => {
      const normalized = name.trim().toLowerCase();
      if (!normalized || forbiddenHeaderNames.has(normalized) || /[\r\n]/u.test(value)) {
        throw new LabUpstreamError('lab_upstream_blocked', `Mock header ${name} is not allowed`);
      }
      return [normalized, value];
    }));
    return { method, path, status, headers, body: route.body, latencyMs };
  });
}

function mockConfiguration(routes: LabMockRoute[]): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify({ routes })) as Prisma.InputJsonObject;
}

const selection = {
  id: true,
  workspaceId: true,
  name: true,
  kind: true,
  targetUrl: true,
  mockConfig: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

export async function listLabUpstreams(workspaceId: string) {
  return prisma.labUpstream.findMany({
    where: { workspaceId },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: selection,
  });
}

export async function createLabUpstream(input: CreateLabUpstreamInput) {
  const targetUrl = input.kind === 'publicHttps'
    ? normalizeLabPublicHttpsUrl(input.targetUrl)
    : null;
  const mockConfig = input.kind === 'mock'
    ? mockConfiguration(normalizeLabMockRoutes(input.routes))
    : {} satisfies Prisma.InputJsonObject;
  try {
    return await prisma.$transaction(async transaction => {
      const upstream = await transaction.labUpstream.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name.trim(),
          kind: input.kind === 'mock' ? LabUpstreamKind.mock : LabUpstreamKind.publicHttps,
          targetUrl,
          mockConfig,
          active: input.active ?? true,
        },
        select: selection,
      });
      await recordAudit(transaction, input.workspaceId, input.actor, 'labUpstream.create', upstream.id);
      return upstream;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new LabUpstreamError('lab_upstream_conflict', 'An upstream with this name already exists');
    }
    throw error;
  }
}

export async function updateLabUpstream(input: UpdateLabUpstreamInput) {
  return prisma.$transaction(async transaction => {
    const current = await transaction.labUpstream.findFirst({
      where: { id: input.upstreamId, workspaceId: input.workspaceId },
      select: { id: true, kind: true },
    });
    if (!current) {
      throw new LabUpstreamError('lab_resource_not_found', 'Lab upstream does not exist');
    }
    const requestedKind = input.kind
      ? (input.kind === 'mock' ? LabUpstreamKind.mock : LabUpstreamKind.publicHttps)
      : current.kind;
    const targetUrl = input.targetUrl === undefined
      ? undefined
      : normalizeLabPublicHttpsUrl(input.targetUrl);
    const mockConfig = input.routes === undefined
      ? undefined
      : mockConfiguration(normalizeLabMockRoutes(input.routes));
    if (requestedKind === LabUpstreamKind.mock && input.targetUrl !== undefined) {
      throw new LabUpstreamError('lab_upstream_blocked', 'Mock upstreams cannot define a target URL');
    }
    if (requestedKind === LabUpstreamKind.publicHttps && input.routes !== undefined) {
      throw new LabUpstreamError('lab_upstream_blocked', 'Public upstreams cannot define mock routes');
    }
    const upstream = await transaction.labUpstream.update({
      where: { id: current.id },
      data: {
        name: input.name?.trim(),
        kind: requestedKind,
        targetUrl: requestedKind === LabUpstreamKind.mock ? null : targetUrl,
        mockConfig: requestedKind === LabUpstreamKind.publicHttps ? {} : mockConfig,
        active: input.active,
      },
      select: selection,
    });
    await recordAudit(transaction, input.workspaceId, input.actor, 'labUpstream.update', upstream.id);
    return upstream;
  });
}

export async function resolveLabUpstreamInternalUrl(
  workspaceId: string,
  upstreamId: string,
): Promise<string> {
  const upstream = await prisma.labUpstream.findFirst({
    where: { id: upstreamId, workspaceId, active: true },
    select: { id: true },
  });
  if (!upstream) {
    throw new LabUpstreamError('lab_resource_not_found', 'Active lab upstream does not exist');
  }
  return `http://lab-egress:3010/upstreams/${upstream.id}`;
}

async function recordAudit(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  actor: LabUpstreamActor,
  action: string,
  resourceId: string,
) {
  const workspace = await transaction.labWorkspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { organizationId: true },
  });
  await transaction.auditEvent.create({
    data: {
      actorIssuer: actor.issuer,
      actorSubject: actor.subject,
      actorRole: AdminRole.organizationAdmin,
      organizationId: workspace.organizationId,
      action,
      resourceType: 'LabUpstream',
      resourceId,
      metadata: { workspaceId },
    },
  });
}
