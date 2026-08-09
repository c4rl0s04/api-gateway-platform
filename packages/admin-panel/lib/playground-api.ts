import type { PlaygroundExecutionInput } from '@/lib/playground';
import type { PlaygroundExecutionResult } from '@/lib/playground-service';

export class PlaygroundApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PlaygroundApiError';
  }
}

export async function executePlayground(
  input: PlaygroundExecutionInput,
): Promise<PlaygroundExecutionResult> {
  return executeAt('/api/playground', input);
}

export async function executeLabPlayground(
  input: PlaygroundExecutionInput,
): Promise<PlaygroundExecutionResult> {
  return executeAt('/api/lab/playground', input);
}

async function executeAt(
  endpoint: string,
  input: PlaygroundExecutionInput,
): Promise<PlaygroundExecutionResult> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      message?: string;
      error?: string;
    };
    throw new PlaygroundApiError(
      body.message ?? body.error ?? `Playground request failed (${response.status})`,
      response.status,
      body.error,
    );
  }
  return response.json() as Promise<PlaygroundExecutionResult>;
}
