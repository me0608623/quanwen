import { describe, it, expect, beforeEach } from 'vitest';
import { ZaiTelemetryAggregator, type TelemetryRecord } from './telemetry';

function rec(over: Partial<TelemetryRecord> = {}): TelemetryRecord {
  return {
    ts: Date.now(),
    promptKey: 'quality_audit.holistic_judge',
    promptVersion: '1.0.0',
    totalTokens: 100,
    promptTokens: 70,
    completionTokens: 30,
    latencyMs: 1000,
    attempts: 1,
    finishReason: 'stop',
    cacheHit: false,
    ...over,
  };
}

describe('ZaiTelemetryAggregator', () => {
  let agg: ZaiTelemetryAggregator;

  beforeEach(() => {
    agg = new ZaiTelemetryAggregator(5); // 小 ring buffer 測淘汰
  });

  it('空 aggregator snapshot 全為 0', () => {
    const s = agg.snapshot();
    expect(s.totalCalls).toBe(0);
    expect(s.window.calls).toBe(0);
    expect(s.window.avgLatencyMs).toBe(0);
    expect(s.window.p95LatencyMs).toBe(0);
  });

  it('記錄成功 call → 累計 + window 都更新', () => {
    agg.record(rec({ totalTokens: 200, latencyMs: 500 }));
    const s = agg.snapshot();
    expect(s.totalCalls).toBe(1);
    expect(s.window.calls).toBe(1);
    expect(s.window.sumTotalTokens).toBe(200);
    expect(s.window.avgLatencyMs).toBe(500);
  });

  it('cache hit 不計入 latency 平均', () => {
    agg.record(rec({ latencyMs: 1000, cacheHit: false }));
    agg.record(rec({ latencyMs: 0, cacheHit: true, finishReason: 'cache_hit' }));
    const s = agg.snapshot();
    expect(s.window.calls).toBe(2);
    expect(s.window.cacheHits).toBe(1);
    expect(s.cacheHits).toBe(1);
    // 只有 1 個 real call (1000ms)，平均不被 cache 的 0ms 稀釋
    expect(s.window.avgLatencyMs).toBe(1000);
  });

  it('error 記錄 → byErrorKind + totalErrors 更新，不計入 latency', () => {
    agg.record(rec({ errorKind: 'timeout', finishReason: 'error', latencyMs: 30000 }));
    agg.record(rec({ errorKind: 'http_5xx', finishReason: 'error' }));
    agg.record(rec({ errorKind: 'timeout', finishReason: 'error' }));
    const s = agg.snapshot();
    expect(s.totalErrors).toBe(3);
    expect(s.window.errors).toBe(3);
    expect(s.window.byErrorKind['timeout']).toBe(2);
    expect(s.window.byErrorKind['http_5xx']).toBe(1);
    // 全是 error，沒有 real success call → avgLatency 0
    expect(s.window.avgLatencyMs).toBe(0);
  });

  it('byPromptKey 聚合正確', () => {
    agg.record(rec({ promptKey: 'a.x', totalTokens: 100 }));
    agg.record(rec({ promptKey: 'a.x', totalTokens: 50 }));
    agg.record(rec({ promptKey: 'b.y', totalTokens: 200, errorKind: 'parse', finishReason: 'error' }));
    const s = agg.snapshot();
    expect(s.window.byPromptKey['a.x']).toEqual({ calls: 2, sumTokens: 150, errors: 0 });
    expect(s.window.byPromptKey['b.y']).toEqual({ calls: 1, sumTokens: 200, errors: 1 });
  });

  it('promptKey 缺失 → (unknown) bucket', () => {
    agg.record(rec({ promptKey: undefined }));
    const s = agg.snapshot();
    expect(s.window.byPromptKey['(unknown)']?.calls).toBe(1);
  });

  it('ring buffer 超過 maxSize → 淘汰最舊，但 cumulative 不變', () => {
    for (let i = 0; i < 8; i++) {
      agg.record(rec({ totalTokens: 10 }));
    }
    const s = agg.snapshot();
    expect(s.totalCalls).toBe(8); // 累計不受淘汰影響
    expect(s.windowSize).toBe(5); // ring buffer 只留 5
    expect(s.window.sumTotalTokens).toBe(50); // 5 × 10
  });

  it('p95 latency 計算', () => {
    const a = new ZaiTelemetryAggregator(100);
    // 20 筆 100..2000ms
    for (let i = 1; i <= 20; i++) {
      a.record(rec({ latencyMs: i * 100 }));
    }
    const s = a.snapshot();
    // p95 of [100..2000] step 100 → index floor(20*0.95)=19 → 第20個=2000；clamp 到 19 → 1900~2000
    expect(s.window.p95LatencyMs).toBeGreaterThanOrEqual(1900);
  });

  it('reset 清空所有狀態', () => {
    agg.record(rec());
    agg.record(rec({ errorKind: 'timeout' }));
    agg.reset();
    const s = agg.snapshot();
    expect(s.totalCalls).toBe(0);
    expect(s.totalErrors).toBe(0);
    expect(s.windowSize).toBe(0);
  });
});
