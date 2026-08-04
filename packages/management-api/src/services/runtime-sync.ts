import { Redis } from 'ioredis';
import {
  GATEWAY_RUNTIME_STATUS_PREFIX,
  gatewayRuntimeStatusSchema,
  type GatewayRuntimeStatus,
} from '@api-gateway/shared';
import {
  countPendingGatewayConfigChanges,
  getLatestGatewayConfigVersion,
} from '@api-gateway/database';
import type { AdminPrincipal } from '../auth/authorization.js';

interface RuntimeStatusClient {
  scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number,
  ): Promise<[string, string[]]>;
  mget(...keys: string[]): Promise<Array<string | null>>;
  quit(): Promise<unknown>;
  disconnect(): void;
  readonly status: string;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

interface RuntimeStatusStore {
  latestVersion(): Promise<number>;
  pendingCount(): Promise<number>;
}

const defaultStore: RuntimeStatusStore = {
  latestVersion: getLatestGatewayConfigVersion,
  pendingCount: countPendingGatewayConfigChanges,
};

export interface RuntimeSyncOperations {
  getStatus(actor: AdminPrincipal): Promise<unknown>;
}

export class RuntimeSyncService implements RuntimeSyncOperations {
  constructor(
    private readonly client: RuntimeStatusClient,
    private readonly store: RuntimeStatusStore = defaultStore,
  ) {
    client.on('error', () => {
      // Redis availability is represented in the response; it is not fatal.
    });
  }

  async getStatus(_actor: AdminPrincipal) {
    const [latestVersion, pendingChanges] = await Promise.all([
      this.store.latestVersion(),
      this.store.pendingCount(),
    ]);
    let gateways: GatewayRuntimeStatus[] = [];
    let redisAvailable = true;
    try {
      const keys = await this.findStatusKeys();
      const values = keys.length > 0 ? await this.client.mget(...keys) : [];
      gateways = values.flatMap(value => {
        if (!value) return [];
        try {
          const parsed = gatewayRuntimeStatusSchema.safeParse(JSON.parse(value));
          return parsed.success ? [parsed.data] : [];
        } catch {
          return [];
        }
      }).sort((left, right) => left.instanceId.localeCompare(right.instanceId));
    } catch {
      redisAvailable = false;
    }
    return {
      latestVersion,
      pendingChanges,
      redisAvailable,
      gateways: gateways.map(gateway => ({
        ...gateway,
        synchronized: gateway.state === 'applied'
          && gateway.appliedVersion >= latestVersion,
      })),
    };
  }

  async close(): Promise<void> {
    if (this.client.status === 'ready') await this.client.quit();
    else this.client.disconnect();
  }

  private async findStatusKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const result = await this.client.scan(
        cursor,
        'MATCH',
        `${GATEWAY_RUNTIME_STATUS_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');
    return keys;
  }
}

export function createRuntimeSyncService(redisUrl: string): RuntimeSyncService {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
    retryStrategy: times => Math.min(times * 200, 2_000),
  });
  return new RuntimeSyncService(client);
}
