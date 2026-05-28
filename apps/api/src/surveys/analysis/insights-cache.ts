/**
 * AI 洞察兩層快取（設計文件 §5.4）。
 *
 *   L1 = in-process Map（per-worker，最快，TTL 30 分鐘）
 *   L2 = Redis（跨 worker / pod 共享，degradation-safe；無 URL 或連線失敗 → L1 only）
 *
 * lookup：L1 → L2 →（都 miss 才回 undefined → 呼叫端打 LLM）
 * write：L1 + L2 同時寫
 *
 * 「成功」結果才入 cache；fallback 路徑（樣本不足、LLM 失敗）不入 → 下次 retry。
 * Key = sha256(`${PROMPT_VERSION}:${reportType}:${JSON.stringify(payload)}`)。
 * PROMPT_VERSION 升版 → 整批失效。
 *
 * L2 取消方式：不設 INSIGHTS_REDIS_URL（也不設 REDIS_URL）→ L2 為 null,純 L1。
 */
import { createHash } from 'crypto';
import { RedisCache } from '../../ai-audit/redis-cache';

const TTL_MS = Number(process.env.INSIGHTS_CACHE_TTL_MS) || 30 * 60 * 1000;
const MAX_ENTRIES = Number(process.env.INSIGHTS_CACHE_MAX) || 500;
const PROMPT_VERSION = 'v1';
const KEY_PREFIX = 'insights:cache:';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// L2:Redis 跨進程共享(degradation-safe;沒 URL/沒裝 ioredis/連線失敗 → 自動降級為 L1 only)
const redisUrl = process.env.INSIGHTS_REDIS_URL || process.env.REDIS_URL;
const l2: RedisCache | null = redisUrl ? new RedisCache(redisUrl, TTL_MS, KEY_PREFIX) : null;

export function insightsCacheKey(payload: unknown, reportType: string): string {
  const json = JSON.stringify(payload);
  return createHash('sha256')
    .update(`${PROMPT_VERSION}:${reportType}:${json}`)
    .digest('hex')
    .slice(0, 32);
}

export async function getCachedInsight<T>(key: string): Promise<T | undefined> {
  // L1
  const e = store.get(key);
  if (e) {
    if (e.expiresAt >= Date.now()) return e.value as T;
    store.delete(key); // expired
  }
  // L2
  if (l2) {
    const raw = await l2.get(key);
    if (raw) {
      try {
        const value = JSON.parse(raw) as T;
        // 回填 L1
        store.set(key, { value, expiresAt: Date.now() + TTL_MS });
        return value;
      } catch {
        // L2 內容壞掉 → 視為 miss
      }
    }
  }
  return undefined;
}

export async function setCachedInsight<T>(key: string, value: T): Promise<void> {
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  // 容量保護(Map 插入順序 = 寫入順序,刪最舊)
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value as string | undefined;
    if (oldest !== undefined) store.delete(oldest);
  }
  if (l2) {
    try {
      await l2.set(key, JSON.stringify(value));
    } catch {
      // L2 寫失敗無所謂,L1 已寫,下次仍可 hit
    }
  }
}

export function clearInsightsCache(): void {
  store.clear();
  // L2 不主動 clear(跨進程共享,測試環境會用 INSIGHTS_REDIS_URL=undef 走純 L1)
}

export function insightsCacheSize(): number {
  return store.size;
}

export function isL2Enabled(): boolean {
  return l2 !== null;
}
