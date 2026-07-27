import { prisma } from '@api-gateway/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { OidcVerifier } from './oidc.js';
import type {
  AdminMembershipRecord,
  AdminPrincipal,
} from './authorization.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminPrincipal: AdminPrincipal;
  }
}

export interface MembershipStore {
  findActive(issuer: string, subject: string): Promise<AdminMembershipRecord[]>;
}

export const prismaMembershipStore: MembershipStore = {
  findActive: (issuer, subject) => prisma.adminMembership.findMany({
    where: {
      oidcIssuer: issuer,
      oidcSubject: subject,
      active: true,
    },
    select: {
      id: true,
      role: true,
      organizationId: true,
      active: true,
    },
  }),
};

export function createAuthenticationHook(
  verifier: OidcVerifier,
  memberships: MembershipStore,
) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      await reply.code(401).send({
        error: 'unauthorized',
        message: 'A Bearer access token is required',
      });
      return;
    }
    try {
      const identity = await verifier.verify(authorization.slice(7));
      const activeMemberships = await memberships.findActive(
        identity.issuer,
        identity.subject,
      );
      if (activeMemberships.length === 0) {
        await reply.code(403).send({
          error: 'forbidden',
          message: 'The OIDC identity has no active platform membership',
        });
        return;
      }
      request.adminPrincipal = {
        issuer: identity.issuer,
        subject: identity.subject,
        memberships: activeMemberships,
      };
    } catch (error) {
      request.log.warn({ err: error }, 'OIDC authentication rejected');
      await reply.code(401).send({
        error: 'unauthorized',
        message: 'The access token is invalid or expired',
      });
    }
  };
}
