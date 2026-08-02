import { AdminRole, AuthorizationStatus } from './generated/index.js';
import { prisma } from './client.js';

export type ApplicationManagementErrorCode =
  | 'app_not_found'
  | 'credential_not_found'
  | 'product_not_found'
  | 'product_not_active'
  | 'organization_mismatch'
  | 'invalid_scope'
  | 'invalid_status_transition'
  | 'public_key_not_found';

export class ApplicationManagementError extends Error {
  constructor(
    public readonly code: ApplicationManagementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationManagementError';
  }
}

export interface ApplicationMutationActor {
  issuer: string;
  subject: string;
  role: AdminRole;
}

function validateStatusTransition(
  current: AuthorizationStatus,
  next: AuthorizationStatus,
): void {
  const allowed = current === next
    || current === AuthorizationStatus.pending
      && (next === AuthorizationStatus.approved
        || next === AuthorizationStatus.revoked)
    || current === AuthorizationStatus.approved
      && next === AuthorizationStatus.revoked;
  if (!allowed) {
    throw new ApplicationManagementError(
      'invalid_status_transition',
      `Cannot change authorization status from ${current} to ${next}`,
    );
  }
}

export interface UpdateDeveloperApplicationInput {
  appId: string;
  name?: string;
  status?: AuthorizationStatus;
  actor: ApplicationMutationActor;
}

export async function updateDeveloperApplication(
  input: UpdateDeveloperApplicationInput,
) {
  return prisma.$transaction(async transaction => {
    const current = await transaction.developerApp.findUnique({
      where: { id: input.appId },
      select: { id: true, name: true, status: true, organizationId: true },
    });
    if (!current) {
      throw new ApplicationManagementError(
        'app_not_found',
        'Developer application does not exist',
      );
    }
    if (input.status) validateStatusTransition(current.status, input.status);
    const application = await transaction.developerApp.update({
      where: { id: input.appId },
      data: { name: input.name?.trim(), status: input.status },
      select: {
        id: true,
        name: true,
        status: true,
        organizationId: true,
        createdAt: true,
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorIssuer: input.actor.issuer,
        actorSubject: input.actor.subject,
        actorRole: input.actor.role,
        organizationId: current.organizationId,
        action: 'application.update',
        resourceType: 'DeveloperApp',
        resourceId: input.appId,
        metadata: {
          changedFields: [
            ...(input.name !== undefined ? ['name'] : []),
            ...(input.status !== undefined ? ['status'] : []),
          ],
          previousName: current.name,
          previousStatus: current.status,
        },
      },
    });
    return application;
  });
}
