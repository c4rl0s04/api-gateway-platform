import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  createPersonalLabWorkspace,
  getPersonalLabWorkspace,
  LabWorkspaceError,
  prisma,
} from '../src/index.js';

const integration = process.env.RUN_DATABASE_INTEGRATION === '1'
  ? describe
  : describe.skip;
const suffix = randomUUID();
const principal = {
  issuer: 'test://lab-workspaces',
  subject: `owner-${suffix}`,
};

integration('personal lab workspace lifecycle', () => {
  async function cleanup() {
    const workspaces = await prisma.labWorkspace.findMany({
      where: {
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
      },
      select: { id: true, organizationId: true },
    });
    const organizationIds = workspaces.map(workspace => workspace.organizationId);
    await prisma.gatewayConfigChange.deleteMany({
      where: { resourceId: { in: workspaces.map(workspace => workspace.id) } },
    });
    await prisma.auditEvent.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.developerApp.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.labUpstream.deleteMany({
      where: { workspaceId: { in: workspaces.map(workspace => workspace.id) } },
    });
    await prisma.labWorkspace.deleteMany({
      where: {
        ownerIssuer: principal.issuer,
        ownerSubject: principal.subject,
      },
    });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }

  before(cleanup);
  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('creates one hidden, idempotent workspace for an OIDC principal', async () => {
    const first = await createPersonalLabWorkspace(principal);
    const second = await createPersonalLabWorkspace(principal);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.workspace.id, first.workspace.id);
    assert.equal(first.workspace.organization.kind, 'lab');
    assert.equal(first.workspace.hostname, `${first.workspace.id}.lab.gateway.localhost`);
    assert.ok(first.workspace.expiresAt.getTime() > Date.now() + 23 * 60 * 60 * 1000);
  });

  it('rejects cross-principal access and lazily expires every credential material', async () => {
    const workspace = await getPersonalLabWorkspace(principal);
    const app = await prisma.developerApp.create({
      data: {
        name: 'Lab application',
        organizationId: workspace.organizationId,
        credentials: {
          create: {
            consumerKey: `lab-${suffix}`,
            consumerSecretHash: 'test-only-hash',
            purpose: 'lab',
            publicKeys: {
              create: {
                kid: `kid-${suffix}`,
                jwk: { kty: 'RSA', n: 'test', e: 'AQAB' },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    await assert.rejects(
      getPersonalLabWorkspace({ ...principal, subject: `other-${suffix}` }),
      (error: unknown) => error instanceof LabWorkspaceError
        && error.code === 'lab_resource_not_found',
    );
    await assert.rejects(
      getPersonalLabWorkspace(
        principal,
        new Date(workspace.expiresAt.getTime() + 1),
      ),
      (error: unknown) => error instanceof LabWorkspaceError
        && error.code === 'lab_expired',
    );
    const expired = await prisma.labWorkspace.findUniqueOrThrow({
      where: { id: workspace.id },
      select: {
        status: true,
        organization: {
          select: {
            apps: {
              where: { id: app.id },
              select: {
                status: true,
                credentials: {
                  select: {
                    status: true,
                    publicKeys: { select: { status: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    assert.equal(expired.status, 'expired');
    assert.equal(expired.organization.apps[0]?.status, 'revoked');
    assert.equal(expired.organization.apps[0]?.credentials[0]?.status, 'revoked');
    assert.equal(
      expired.organization.apps[0]?.credentials[0]?.publicKeys[0]?.status,
      'revoked',
    );
  });
});
