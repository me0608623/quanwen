/**
 * Phase II.10: RedisCache degradation-safe 行為驗證
 *
 * 重點不是測「Redis 真的能 cache」（那要起 Redis），而是測「Redis 不可用時
 * 絕不拖累主流程」—— 這是 degradation-safe 設計的核心保證。
 */
import { describe, it, expect } from 'vitest';
import { RedisCache } from './redis-cache';

describe('RedisCache (degradation-safe)', () => {
  it('1. 無 URL → get/set 都 no-op，不 throw', async () => {
    const c = new RedisCache(undefined, 60_000);
    await expect(c.get('k')).resolves.toBeUndefined();
    await expect(c.set('k', 'v')).resolves.toBeUndefined();
    expect(c.isEnabled).toBe(false);
    await c.close();
  });

  it('2. 連不上的 URL → get 回 undefined（當 miss），不 throw', async () => {
    // 指向一個不會有 Redis 的 port
    const c = new RedisCache('redis://127.0.0.1:6399', 60_000);
    // ioredis 沒裝時走 dynamic import fail 分支；裝了則連線失敗 → 兩條路都該回 undefined
    await expect(c.get('k')).resolves.toBeUndefined();
    await expect(c.set('k', 'v')).resolves.toBeUndefined();
    await c.close();
  });

  it('3. close() 可重複呼叫不 throw', async () => {
    const c = new RedisCache(undefined, 60_000);
    await c.close();
    await expect(c.close()).resolves.toBeUndefined();
  });

  it('4. get 在 set 之後（無 Redis）仍 miss — 確認沒有假裝成功', async () => {
    const c = new RedisCache(undefined, 60_000);
    await c.set('k', 'v');
    await expect(c.get('k')).resolves.toBeUndefined();
    await c.close();
  });
});
