export class LabApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'LabApiError';
  }
}

export async function labFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/lab/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
    };
    throw new LabApiError(
      error.message ?? `Lab request failed with status ${response.status}`,
      response.status,
      error.error,
    );
  }
  return response.json() as Promise<T>;
}
