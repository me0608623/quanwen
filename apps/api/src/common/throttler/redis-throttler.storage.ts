import { Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { RedisLike } from '../redis/redis.service';

/**
 * P2: Redis-backed ThrottlerStorage（跨實例共享限流計數）。
 *
 * 為何自實作而非引外部套件：
 * - @nestjs/throttler@5.2.0 的 storage 介面是 `increment(key, ttl): {totalHits, timeToExpire}`，
 *   外部 redis storage 套件在 v5/v6 之間介面有改、版本對應脆弱。
 * - 自實作只用 ioredis（已在 optionalDependencies），可完全控制 prefix 與降級行為。
 *
 * 演算法（與內建 in-memory ThrottlerStorageService 等價的固定視窗）：
 *   INCR key；若是第一次（=1）就 PEXPIRE ttl(ms)；回傳 totalHits 與剩餘秒數。
 *   用 Lua 保證 INCR + PEXPIRE + PTTL 的原子性。
 *
 * 降級策略（明確、不 silent fail）：
 * - Redis 未設定 / ioredis 未裝 / 連線錯誤 → fallback 到 in-memory（逐實例限流，
 *   仍會擋，只是不跨實例共享）+ logger.error 告警。**絕不會變成「無限流」。**
 *
 * Key 前綴 qw:throttle:，與 LLM cache（zai:cache:）、lock（qw:lock:）完全隔離。
 */

// KEYS[1]=throttle key, ARGV[1]=ttl(ms)。回傳 {目前計數, PTTL(ms)}
const INCR_SCRIPT = [
  "local c = redis.call('INCR', KEYS[1])",
  "if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local t = redis.call('PTTL', KEYS[1])",
  'return {c, t}',
].join('\n');

const KEY_PREFIX = 'qw:throttle:';

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger('RedisThrottlerStorage');
  private client: RedisLike | null = null;
  private initStarted = false;
  private degradeLogged = false;
  /** 降級用的內建 in-memory storage（與沒改前的行為一致） */
  private readonly fallback = new ThrottlerStorageService();

  constructor(private readonly url?: string) {
    this.init();
  }

  private init(): void {
    if (this.initStarted) return;
    this.initStarted = true;

    if (!this.url) {
      this.logger.warn('REDIS_URL 未設定，Throttler 使用 in-memory storage（多實例不共享限流）');
      return;
    }

    void (async () => {
      const moduleName = 'ioredis';
      const mod = (await import(moduleName).catch(() => null)) as
        | { default: new (url: string, opts?: unknown) => RedisLike }
        | null;
      if (!mod) {
        this.logger.warn('ioredis 未安裝，Throttler 使用 in-memory storage（多實例不共享限流）');
        return;
      }
      const RedisCtor = mod.default;
      const client = new RedisCtor(this.url as string, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
        lazyConnect: false,
      });
      client.on('error', (err: unknown) => {
        if (!this.degradeLogged) {
          this.logger.error(
            `Throttler Redis 連線錯誤，降級為 in-memory 限流（多實例不共享）: ${(err as Error)?.message}`,
          );
          this.degradeLogged = true;
        }
      });
      client.on('ready', () => {
        this.degradeLogged = false;
        this.logger.log('Throttler Redis storage ready');
      });
      this.client = client;
    })();
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    if (this.client) {
      try {
        const res = (await this.client.eval(INCR_SCRIPT, 1, KEY_PREFIX + key, ttl)) as [
          number,
          number,
        ];
        const totalHits = Number(res[0]);
        const pttl = Number(res[1]);
        // pttl 為毫秒；timeToExpire 介面要求秒（與內建 storage 一致）
        const timeToExpire = pttl > 0 ? Math.ceil(pttl / 1000) : Math.ceil(ttl / 1000);
        const isBlocked = totalHits > limit;
        const timeToBlockExpire = isBlocked ? timeToExpire : 0;
        return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
      } catch (err) {
        if (!this.degradeLogged) {
          this.logger.error(
            `Throttler Redis increment 失敗，降級 in-memory: ${(err as Error)?.message}`,
          );
          this.degradeLogged = true;
        }
        // 落到 fallback
      }
    }
    return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
  }
}
