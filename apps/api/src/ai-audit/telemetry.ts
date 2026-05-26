import type { ZaiErrorKind } from './zai.client';

/**
 * Phase II.9: LLM call telemetry in-memory aggregator。
 *
 * 為什麼 in-memory 而非直接寫 DB：
 * - DB telemetry（zai_call_log table）需要 schema migration，目前 db/schema 正被平行改動，
 *   先做 in-memory aggregator 當「先導」— 提供即時聚合查詢，零 schema 風險
 * - ring buffer 保留最近 N 筆，避免無限長記憶體成長
 * - 未來要落 DB 時，record() 的 call site 不變，只是多一個 sink
 *
 * 這個 module 是 process-local singleton（與 ZaiCache 同個生命週期假設）。
 * 多 worker 部署時各自獨立 — snapshot 反映單一 worker 的 LLM 活動。
 */

export interface TelemetryRecord {
  ts: number;             // epoch ms
  promptKey?: string;
  promptVersion?: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempts: number;
  finishReason: string;
  errorKind?: ZaiErrorKind; // 有值表示這次 call 最終失敗
  cacheHit: boolean;
}

export interface TelemetrySnapshot {
  windowSize: number;       // ring buffer 目前筆數
  totalCalls: number;       // 累計（含已被 ring buffer 淘汰的）
  totalErrors: number;      // 累計失敗
  cacheHits: number;        // 累計 cache 命中
  // 以下基於 ring buffer 視窗
  window: {
    calls: number;
    errors: number;
    cacheHits: number;
    sumTotalTokens: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    byPromptKey: Record<string, { calls: number; sumTokens: number; errors: number }>;
    byErrorKind: Record<string, number>;
  };
}

const DEFAULT_RING_SIZE = 500;

/**
 * Sink：record() 時除了進 ring buffer，也轉給已註冊的 sink（如 DB 持久化）。
 * sink-agnostic 設計 — ZaiClient 只 call record()，不知道有沒有 DB。
 * Phase II.11 的 ZaiCallLogService 會 registerSink 把每筆寫進 zai_call_log table。
 */
export type TelemetrySink = (r: TelemetryRecord) => void;

export class ZaiTelemetryAggregator {
  private ring: TelemetryRecord[] = [];
  private readonly maxSize: number;
  private sinks: TelemetrySink[] = [];

  // 累計計數（不受 ring buffer 淘汰影響）
  private cumulativeCalls = 0;
  private cumulativeErrors = 0;
  private cumulativeCacheHits = 0;

  constructor(maxSize = DEFAULT_RING_SIZE) {
    this.maxSize = maxSize;
  }

  /** 註冊 sink（如 DB 持久化）。回傳 unregister fn */
  registerSink(sink: TelemetrySink): () => void {
    this.sinks.push(sink);
    return () => {
      this.sinks = this.sinks.filter((s) => s !== sink);
    };
  }

  record(r: TelemetryRecord): void {
    this.cumulativeCalls++;
    if (r.errorKind) this.cumulativeErrors++;
    if (r.cacheHit) this.cumulativeCacheHits++;

    this.ring.push(r);
    if (this.ring.length > this.maxSize) {
      this.ring.shift();
    }

    // 轉給 sink（DB 等）— sink 自己負責 fire-and-forget / 錯誤吞掉
    for (const sink of this.sinks) {
      try {
        sink(r);
      } catch {
        /* sink 出錯絕不能影響主流程 */
      }
    }
  }

  snapshot(): TelemetrySnapshot {
    const window = this.ring;
    const calls = window.length;
    const errors = window.filter((r) => r.errorKind).length;
    const cacheHits = window.filter((r) => r.cacheHit).length;
    const sumTotalTokens = window.reduce((s, r) => s + r.totalTokens, 0);

    // 只算「真的有打 LLM」的 latency（cache hit latency≈0 會稀釋平均）
    const realCalls = window.filter((r) => !r.cacheHit && !r.errorKind);
    const latencies = realCalls.map((r) => r.latencyMs).sort((a, b) => a - b);
    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
        : 0;
    const p95LatencyMs =
      latencies.length > 0
        ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]!
        : 0;

    const byPromptKey: Record<string, { calls: number; sumTokens: number; errors: number }> = {};
    for (const r of window) {
      const key = r.promptKey ?? '(unknown)';
      const entry = byPromptKey[key] ?? { calls: 0, sumTokens: 0, errors: 0 };
      entry.calls++;
      entry.sumTokens += r.totalTokens;
      if (r.errorKind) entry.errors++;
      byPromptKey[key] = entry;
    }

    const byErrorKind: Record<string, number> = {};
    for (const r of window) {
      if (r.errorKind) {
        byErrorKind[r.errorKind] = (byErrorKind[r.errorKind] ?? 0) + 1;
      }
    }

    return {
      windowSize: calls,
      totalCalls: this.cumulativeCalls,
      totalErrors: this.cumulativeErrors,
      cacheHits: this.cumulativeCacheHits,
      window: {
        calls,
        errors,
        cacheHits,
        sumTotalTokens,
        avgLatencyMs,
        p95LatencyMs,
        byPromptKey,
        byErrorKind,
      },
    };
  }

  /** 測試 / 手動重置用 */
  reset(): void {
    this.ring = [];
    this.cumulativeCalls = 0;
    this.cumulativeErrors = 0;
    this.cumulativeCacheHits = 0;
  }
}

/** Process-local singleton — ZaiClient 寫入、admin 可查 */
export const zaiTelemetry = new ZaiTelemetryAggregator();
