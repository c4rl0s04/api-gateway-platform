import { Redis } from 'ioredis';
import {
  GATEWAY_CONFIG_CHANGE_CHANNEL,
  GATEWAY_RUNTIME_STATUS_PREFIX,
  gatewayConfigChangeMessageSchema,
  type GatewayRuntimeStatus,
  type ProxyConfig,
} from '@api-gateway/shared';
import { getLatestGatewayConfigVersion } from '@api-gateway/database';

interface RuntimeSyncLogger {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
}

export interface GatewayConfigReloaderOptions {
  instanceId: string;
  initialVersion: number;
  loadSnapshot: () => Promise<ProxyConfig[]>;
  applySnapshot: (proxies: ProxyConfig[]) => void;
  getLatestVersion?: () => Promise<number>;
  publishStatus?: (status: GatewayRuntimeStatus) => Promise<void>;
  now?: () => Date;
  logger?: RuntimeSyncLogger;
}

const silentLogger: RuntimeSyncLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class GatewayConfigReloader {
  private appliedVersion: number;
  private requestedVersion: number;
  private activeReload: Promise<void> | null = null;
  private lastAppliedAt: string;
  private lastError: string | null = null;
  private state: GatewayRuntimeStatus['state'] = 'applied';

  constructor(private readonly options: GatewayConfigReloaderOptions) {
    this.appliedVersion = options.initialVersion;
    this.requestedVersion = options.initialVersion;
    this.lastAppliedAt = (options.now ?? (() => new Date()))().toISOString();
  }

  status(): GatewayRuntimeStatus {
    return {
      instanceId: this.options.instanceId,
      state: this.state,
      appliedVersion: this.appliedVersion,
      lastAppliedAt: this.lastAppliedAt,
      lastError: this.lastError,
    };
  }

  async reportStatus(): Promise<void> {
    try {
      await this.options.publishStatus?.(this.status());
    } catch (error) {
      (this.options.logger ?? silentLogger).warn(
        { error: errorMessage(error) },
        'Unable to publish gateway runtime status',
      );
    }
  }

  async reconcile(): Promise<void> {
    try {
      const latest = await (this.options.getLatestVersion
        ?? getLatestGatewayConfigVersion)();
      await this.requestReload(latest);
      if (latest <= this.appliedVersion) await this.reportStatus();
    } catch (error) {
      this.state = 'error';
      this.lastError = errorMessage(error);
      await this.reportStatus();
      (this.options.logger ?? silentLogger).error(
        { error: this.lastError },
        'Gateway configuration reconciliation failed',
      );
    }
  }

  requestReload(version: number): Promise<void> {
    if (version <= this.appliedVersion) return this.reportStatus();
    this.requestedVersion = Math.max(this.requestedVersion, version);
    if (!this.activeReload) {
      this.activeReload = this.drainReloads().finally(() => {
        this.activeReload = null;
      });
    }
    return this.activeReload;
  }

  private async drainReloads(): Promise<void> {
    while (this.requestedVersion > this.appliedVersion) {
      const targetVersion = this.requestedVersion;
      this.state = 'loading';
      this.lastError = null;
      await this.reportStatus();

      try {
        const snapshot = await this.options.loadSnapshot();
        this.options.applySnapshot(snapshot);
        this.appliedVersion = targetVersion;
        this.lastAppliedAt = (this.options.now ?? (() => new Date()))().toISOString();
        this.state = 'applied';
        await this.reportStatus();
        (this.options.logger ?? silentLogger).info(
          { version: targetVersion, proxiesLoaded: snapshot.length },
          'Gateway configuration reloaded',
        );
      } catch (error) {
        this.requestedVersion = this.appliedVersion;
        this.state = 'error';
        this.lastError = errorMessage(error);
        await this.reportStatus();
        (this.options.logger ?? silentLogger).error(
          { version: targetVersion, error: this.lastError },
          'Gateway configuration reload failed; keeping previous snapshot',
        );
      }
    }
  }
}

export interface GatewayRuntimeSyncOptions {
  redisUrl: string;
  reconcileSeconds: number;
  reloader: GatewayConfigReloader;
  logger?: RuntimeSyncLogger;
}

export class GatewayRuntimeSync {
  private readonly subscriber: Redis;
  private readonly statusClient: Redis;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: GatewayRuntimeSyncOptions) {
    const redisOptions = {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
    };
    this.subscriber = new Redis(options.redisUrl, redisOptions);
    this.statusClient = new Redis(options.redisUrl, redisOptions);
  }

  start(): void {
    const logger = this.options.logger ?? silentLogger;
    this.subscriber.on('error', error => logger.warn(
      { error: error.message },
      'Gateway configuration subscriber is unavailable',
    ));
    this.statusClient.on('error', error => logger.warn(
      { error: error.message },
      'Gateway runtime status publisher is unavailable',
    ));
    this.subscriber.on('message', (_channel, rawMessage) => {
      const parsed = gatewayConfigChangeMessageSchema.safeParse(
        (() => {
          try { return JSON.parse(rawMessage); } catch { return null; }
        })(),
      );
      if (!parsed.success) {
        logger.warn({}, 'Ignored malformed gateway configuration notification');
        return;
      }
      void this.options.reloader.requestReload(parsed.data.version);
    });
    this.subscriber.on('ready', () => {
      void this.options.reloader.reconcile();
    });
    void this.subscriber.subscribe(GATEWAY_CONFIG_CHANGE_CHANNEL).catch(error => {
      logger.warn(
        { error: errorMessage(error) },
        'Unable to subscribe to gateway configuration notifications',
      );
    });
    this.timer = setInterval(
      () => void this.options.reloader.reconcile(),
      this.options.reconcileSeconds * 1_000,
    );
    this.timer.unref();
    void this.options.reloader.reportStatus();
  }

  async publishStatus(status: GatewayRuntimeStatus): Promise<void> {
    const ttlSeconds = Math.max(30, this.options.reconcileSeconds * 3);
    const key = `${GATEWAY_RUNTIME_STATUS_PREFIX}${status.instanceId}`;
    await this.statusClient.set(key, JSON.stringify(status), 'EX', ttlSeconds);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.all([
      this.closeClient(this.subscriber),
      this.closeClient(this.statusClient),
    ]);
  }

  private async closeClient(client: Redis): Promise<void> {
    if (client.status === 'ready') await client.quit();
    else client.disconnect();
  }
}
