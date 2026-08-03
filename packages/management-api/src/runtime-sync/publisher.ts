import { Redis } from 'ioredis';
import {
  GATEWAY_CONFIG_CHANGE_CHANNEL,
  type GatewayConfigChangeMessage,
} from '@api-gateway/shared';
import {
  listPendingGatewayConfigChanges,
  markGatewayConfigChangePublished,
  markGatewayConfigChangePublishFailed,
} from '@api-gateway/database';

interface PublisherClient {
  publish(channel: string, message: string): Promise<number>;
  quit(): Promise<unknown>;
  disconnect(): void;
  readonly status: string;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

interface PublisherStore {
  listPending(limit: number): ReturnType<typeof listPendingGatewayConfigChanges>;
  markPublished(version: number): Promise<unknown>;
  markFailed(version: number, error: string): Promise<unknown>;
}

interface PublisherLogger {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

const defaultStore: PublisherStore = {
  listPending: listPendingGatewayConfigChanges,
  markPublished: markGatewayConfigChangePublished,
  markFailed: markGatewayConfigChangePublishFailed,
};

export interface GatewayConfigNotifier {
  notify(version: number): void;
}

export interface GatewayConfigPublisherOptions {
  client: PublisherClient;
  store?: PublisherStore;
  logger: PublisherLogger;
  intervalMs?: number;
}

export class GatewayConfigPublisher implements GatewayConfigNotifier {
  private readonly store: PublisherStore;
  private readonly intervalMs: number;
  private interval: NodeJS.Timeout | null = null;
  private dispatchPromise: Promise<void> | null = null;

  constructor(private readonly options: GatewayConfigPublisherOptions) {
    this.store = options.store ?? defaultStore;
    this.intervalMs = options.intervalMs ?? 1_000;
    options.client.on('error', error => {
      options.logger.warn({ err: error }, 'Gateway config Redis publisher error');
    });
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.notify(0), this.intervalMs);
    this.interval.unref();
    this.notify(0);
  }

  notify(_version: number): void {
    if (!this.dispatchPromise) {
      this.dispatchPromise = this.dispatchPending().finally(() => {
        this.dispatchPromise = null;
      });
    }
  }

  async flush(): Promise<void> {
    this.notify(0);
    await this.dispatchPromise;
  }

  async close(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    await this.dispatchPromise;
    if (this.options.client.status === 'ready') {
      await this.options.client.quit();
    } else {
      this.options.client.disconnect();
    }
  }

  private async dispatchPending(): Promise<void> {
    let changes;
    try {
      changes = await this.store.listPending(100);
    } catch (error) {
      this.options.logger.warn({ err: error }, 'Could not read gateway config outbox');
      return;
    }
    for (const change of changes) {
      try {
        const message: GatewayConfigChangeMessage = { version: change.version };
        await this.options.client.publish(
          GATEWAY_CONFIG_CHANGE_CHANNEL,
          JSON.stringify(message),
        );
        await this.store.markPublished(change.version);
        this.options.logger.info(
          { configVersion: change.version },
          'Published gateway configuration change',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Redis error';
        try {
          await this.store.markFailed(change.version, message);
        } catch (storeError) {
          this.options.logger.warn(
            { err: storeError, configVersion: change.version },
            'Could not record gateway config publication failure',
          );
        }
        this.options.logger.warn(
          { err: error, configVersion: change.version },
          'Gateway configuration change remains queued',
        );
        break;
      }
    }
  }
}

export function createGatewayConfigPublisher(
  redisUrl: string,
  logger: PublisherLogger,
): GatewayConfigPublisher {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
    retryStrategy: times => times > 3 ? null : Math.min(times * 200, 2_000),
  });
  return new GatewayConfigPublisher({ client, logger });
}
