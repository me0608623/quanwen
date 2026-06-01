import { describe, it, expect, beforeEach } from 'vitest';
import {
  insightsCacheKey,
  getCachedInsight,
  setCachedInsight,
  clearInsightsCache,
  insightsCacheSize,
} from './insights-cache';

beforeEach(() => clearInsightsCache());

describe('insightsCacheKey', () => {
  it('相同 payload + reportType → 相同 key（決定性）', () => {
    const p = { total: 10, q: [{ a: 1 }] };
    expect(insightsCacheKey(p, 'simple')).toBe(insightsCacheKey(p, 'simple'));
  });
  it('不同 reportType → 不同 key', () => {
    const p = { total: 10 };
    expect(insightsCacheKey(p, 'simple')).not.toBe(insightsCacheKey(p, 'detailed'));
  });
  it('不同 payload → 不同 key', () => {
    expect(insightsCacheKey({ total: 10 }, 'simple')).not.toBe(insightsCacheKey({ total: 11 }, 'simple'));
  });
  it('key 為 32 hex', () => {
    expect(insightsCacheKey({ a: 1 }, 'simple')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('L1 get/set/clear（async）', () => {
  it('set 後 get 取得相同值', async () => {
    const k = 'k1';
    await setCachedInsight(k, { foo: 'bar' });
    expect(await getCachedInsight<{ foo: string }>(k)).toEqual({ foo: 'bar' });
  });
  it('未存的 key → undefined', async () => {
    expect(await getCachedInsight('missing')).toBeUndefined();
  });
  it('clear 後 L1 全空', async () => {
    await setCachedInsight('a', 1);
    await setCachedInsight('b', 2);
    expect(insightsCacheSize()).toBe(2);
    clearInsightsCache();
    expect(insightsCacheSize()).toBe(0);
  });
});
