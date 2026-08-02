import { ZodError } from 'zod';

export type ManagementErrorCode =
  | 'invalid_request'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'internal_error'
  | 'organization_not_found'
  | 'product_not_found'
  | 'proxy_not_found'
  | 'environment_not_found'
  | 'app_not_found'
  | 'credential_not_found'
  | 'invalid_scope'
  | 'organization_mismatch'
  | 'invalid_status_transition'
  | 'system_proxy_immutable'
  | 'active_deployment_not_found';

export class ManagementError extends Error {
  constructor(
    public readonly code: ManagementErrorCode,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ManagementError';
  }
}

function defaultCode(statusCode: number): ManagementErrorCode {
  if (statusCode === 400) return 'invalid_request';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 409) return 'conflict';
  return 'internal_error';
}

export function serializeManagementError(error: unknown): {
  statusCode: number;
  body: Record<string, unknown>;
} {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: 'invalid_request',
        message: 'Request validation failed',
        details: error.flatten(),
      },
    };
  }

  if (error instanceof ManagementError) {
    return {
      statusCode: error.statusCode,
      body: { error: error.code, message: error.message },
    };
  }

  const candidate = error as { statusCode?: unknown; message?: unknown };
  const statusCode = typeof candidate?.statusCode === 'number'
    && candidate.statusCode >= 400
    && candidate.statusCode < 500
    ? candidate.statusCode
    : 500;
  return {
    statusCode,
    body: {
      error: defaultCode(statusCode),
      message: statusCode === 500
        ? 'Internal server error'
        : typeof candidate?.message === 'string'
          ? candidate.message
          : 'Request failed',
    },
  };
}
