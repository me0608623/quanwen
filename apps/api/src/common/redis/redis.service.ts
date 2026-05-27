import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * P4: 共用 Redis client（readiness probe + P3 分散式鎖共用）。
 *
 * 設計原則（與 ai-audit/redis-cache.ts 一致的 degradation-safe 風格）：
 * - ioredis 用 **dynamic import**，沒安裝也能編譯 / 執行（client 變 null）
 * - REDIS_URL 沒設 → client = null
 * - 連線錯誤只 log、不 throw；呼叫端自行決定 fallback（readiness=strict、lock=skip/run）
 *
 * 注意：這條連線**不設 keyPrefix**，給 lock（明確 qw:lock: 前綴）與 ping 用。
 * Throttler 走另一條獨立連線（qw:throttle: 前綴），LLM cache 走 ai-audit 既有的
 * RedisCache（zai:cache: 前綴）。三者互不污染。
 */

/** 我們只用到 ioredis 的這幾個 method — 自定義結構型別避免硬依賴 ioredis 型別 */
export interface RedisLike {
  ping(): Promise<string>;
  set(
    key: string,
    value: string,
    px: 'PX',
    ttlMs: number,
    nx: 'NX',
  ): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  status?: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisLike | null = null;
  private initPromise: Promise<void> | null = null;

  /** REDIS_URL 是否有設（給呼叫端判斷「有意接 Redis」用） */
  readonly configured = !!process.env.REDIS_URL;

  /** 懶初始化 — 第一次 getClient/ping 才連線 */
  private ensureClient(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const url = process.env.REDIS_URL;
      if (!url) {
        this.logger.warn('REDIS_URL 未設定，RedisService 停用（readiness 會回報 redis down）');
        return;
      }
      // dynamic import：用變數 specifier 讓 tsc 不做靜態 module 解析
      const moduleName = 'ioredis';
      const mod = (await import(moduleName).catch(() => null)) as
        | { default: new (url: string, opts?: unknown) => RedisLike }
        | null;
      if (!mod) {
        this.logger.warn('ioredis 未安裝，RedisService 停用（readiness 會回報 redis down）');
        return;
      }
      const RedisCtor = mod.default;
      const client = new RedisCtor(url, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        lazyConnect: false,
      });
      client.on('error', (err: unknown) => {
        this.logger.warn(`Redis error: ${(err as Error)?.message}`);
      });
      client.on('ready', () => {
        this.logger.log('Shared Redis client ready');
      });
      this.client = client;
    })();
    return this.initPromise;
  }

  /** 取得底層 client（供 lock 用）；無 Redis / ioredis 未裝 → null */
  async getClient(): Promise<RedisLike | null> {
    await this.ensureClient();
    return this.client;
  }

  /** readiness 用：PONG 才算 up。無 client / 連線失敗 → false */
  async ping(): Promise<boolean> {
    await this.ensureClient();
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* ignore */
      }
      this.client = null;
      this.initPromise = null;
    }
  }
}
