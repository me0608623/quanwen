import { Logger } from '@nestjs/common';

/**
 * Phase II.10: Redis 跨進程 L2 cache。
 *
 * 架構：ZaiClient 的 cache 變成兩層
 *   L1 = in-memory LRU（Phase II.3，per-worker，最快）
 *   L2 = Redis（本檔，跨 worker / 跨 pod 共享）
 *
 * lookup：L1 → L2 →（都 miss 才打 LLM）
 * write：L1 + L2 同時寫
 *
 * 設計原則（degradation-safe）：
 * - ioredis 用 **dynamic import**，沒安裝也能編譯 / 執行（L2 變 no-op）
 * - REDIS_URL（或 ZAI_REDIS_URL）沒設 → L2 停用
 * - Redis 連線失敗 / timeout → log 一次後降級為 in-memory only，不影響主流程
 * - 所有 Redis 操作都包 try/catch；Redis 掛掉絕不能讓 LLM 呼叫失敗
 */

/** 我們只用到 ioredis 的這幾個 method — 自定義結構型別避免硬依賴 */
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  status?: string;
}

const DEFAULT_KEY_PREFIX = 'zai:cache:';

export class RedisCache {
  private readonly logger = new Logger(RedisCache.name);
  private client: RedisLike | null = null;
  private enabled = false;
  private initPromise: Promise<void> | null = null;
  private degradeLogged = false;
  private readonly keyPrefix: string;

  constructor(
    private readonly url: string | undefined,
    private readonly ttlMs: number,
    keyPrefix: string = DEFAULT_KEY_PREFIX,
  ) {
    this.keyPrefix = keyPrefix;
  }

  /** 懶初始化 — 第一次 get/set 才連 Redis */
  private async ensureClient(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!this.url) {
        this.logger.log('Redis L2 cache disabled (no REDIS_URL/ZAI_REDIS_URL)');
        return;
      }
      try {
        // dynamic import：用變數 specifier 讓 tsc 不做靜態 module 解析
        //（ioredis 在 optionalDependencies，沒裝時這行 catch 為 null）
        const moduleName = 'ioredis';
        const mod = (await import(moduleName).catch(() => null)) as
          | { default: new (url: string, opts?: unknown) => RedisLike }
          | null;
        if (!mod) {
          this.logger.warn('ioredis 未安裝；Redis L2 cache 停用（in-memory only）');
          return;
        }
        const RedisCtor = mod.default;
        const client = new RedisCtor(this.url, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: false,
          connectTimeout: 2000,
        });
        client.on('error', (err: unknown) => {
          if (!this.degradeLogged) {
            this.logger.warn(`Redis L2 error, 降級為 in-memory only: ${(err as Error)?.message}`);
            this.degradeLogged = true;
          }
          this.enabled = false;
        });
        client.on('ready', () => {
          this.enabled = true;
          this.degradeLogged = false;
          this.logger.log('Redis L2 cache ready');
        });
        this.client = client;
        this.enabled = true;
      } catch (err) {
        this.logger.warn(`Redis L2 init failed, 降級為 in-memory only: ${(err as Error)?.message}`);
      }
    })();
    return this.initPromise;
  }

  async get(key: string): Promise<string | undefined> {
    await this.ensureClient();
    if (!this.client || !this.enabled) return undefined;
    try {
      const v = await this.client.get(this.keyPrefix + key);
      return v ?? undefined;
    } catch {
      return undefined; // Redis 出錯 → 當 miss，主流程繼續
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureClient();
    if (!this.client || !this.enabled) return;
    try {
      await this.client.set(this.keyPrefix + key, value, 'PX', this.ttlMs);
    } catch {
      // 寫失敗無所謂，L1 仍有；下次 miss 再打 LLM
    }
  }

  /** 測試 / shutdown 用 */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* ignore */
      }
      this.client = null;
      this.enabled = false;
      this.initPromise = null;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}
