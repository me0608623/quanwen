import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from './redis.service';

/**
 * P3: 跨實例分散式鎖（Redis SET NX PX + Lua compare-and-del 釋放）。
 *
 * 用於保護「多實例下會重複執行」的 @Cron 任務。
 *
 * 行為矩陣（明確、不 silent fail）：
 * - Redis 未設定 / ioredis 未安裝（getClient 回 null）→ **直接執行 fn**
 *   （= 單實例 / dev / 測試現狀，零行為改變）
 * - Redis 已設定但 acquire 失敗（連線錯誤）→ **skip 本次** + warn
 *   （寧可暫停一次，也不要在多實例下重複執行金流/資料相關任務）
 * - 取得鎖 → 執行 fn，finally 安全釋放（只刪自己 token 的鎖）
 * - 未取得鎖（被其他實例持有）→ skip + debug log
 */
@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  // 只在 value 等於自己的 token 時才刪，避免誤刪別人重新取得的鎖
  private static readonly RELEASE_SCRIPT =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

  constructor(private readonly redis: RedisService) {}

  /**
   * 在分散式鎖保護下執行 fn。
   * @param key   lock key（建議 qw:lock:<job>）
   * @param ttlMs 鎖 TTL（毫秒）— 應略小於 cron 間隔，holder 崩潰時下個 tick 能重新取得
   * @param fn    要保護的工作
   */
  async withLock(key: string, ttlMs: number, fn: () => Promise<void>): Promise<void> {
    const client = await this.redis.getClient();

    // 無 Redis（未設定 / ioredis 未裝）→ 單實例假設，直接執行
    if (!client) {
      await fn();
      return;
    }

    const token = randomUUID();
    let acquired = false;
    try {
      const res = await client.set(key, token, 'PX', ttlMs, 'NX');
      acquired = res === 'OK';
    } catch (err) {
      // Redis 已設定但連不上 → skip，避免多實例重複執行
      this.logger.warn(
        `lock acquire 失敗（${key}），skip 本次執行: ${(err as Error)?.message}`,
      );
      return;
    }

    if (!acquired) {
      this.logger.debug(`skip: lock held by another instance (${key})`);
      return;
    }

    try {
      await fn();
    } finally {
      try {
        await client.eval(RedisLockService.RELEASE_SCRIPT, 1, key, token);
      } catch (err) {
        // 釋放失敗無妨，TTL 到期會自動解鎖
        this.logger.warn(`lock release 失敗（${key}）: ${(err as Error)?.message}`);
      }
    }
  }
}
