import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { sql, gte, eq, and, isNotNull } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { zaiCallLog } from '../db/schema';
import { zaiTelemetry, type TelemetryRecord } from './telemetry';

/**
 * Phase II.11: 把 in-memory telemetry 落地到 zai_call_log table。
 *
 * 機制：onModuleInit 時 registerSink 到 zaiTelemetry。之後每次 LLM call 的
 * record() 都會轉給這裡，fire-and-forget 寫入 DB。
 *
 * 為什麼用 sink 而非改 ZaiClient：
 * - ZaiClient 在多處被 `new` 出來（含測試），不方便注入 DB
 * - sink 解耦：ZaiClient 只管 record()，DB 落地是可選的 side-channel
 * - DB 掛掉 / 沒接 sink → telemetry 仍進 in-memory aggregator，主流程不受影響
 */
@Injectable()
export class ZaiCallLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZaiCallLogService.name);
  private unregister: (() => void) | null = null;
  private writeErrorLogged = false;

  constructor(@Inject(DB) private readonly db: AppDb) {}

  onModuleInit(): void {
    this.unregister = zaiTelemetry.registerSink((r) => this.persist(r));
    this.logger.log('zai_call_log sink registered');
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  /** fire-and-forget 寫一筆。錯誤吞掉只 log 一次，不阻塞 LLM 主流程 */
  private persist(r: TelemetryRecord): void {
    void this.db
      .insert(zaiCallLog)
      .values({
        model: 'glm-5.1', // record() 沒帶 model，用環境預設；未來可擴充 TelemetryRecord 帶 model
        promptKey: r.promptKey ?? null,
        promptVersion: r.promptVersion ?? null,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        latencyMs: r.latencyMs,
        attempts: r.attempts,
        finishReason: r.finishReason,
        errorKind: r.errorKind ?? null,
        cacheHit: r.cacheHit,
      })
      .catch((err: unknown) => {
        if (!this.writeErrorLogged) {
          this.logger.warn(`zai_call_log 寫入失敗（後續同類錯誤靜默）：${(err as Error)?.message}`);
          this.writeErrorLogged = true;
        }
      });
  }

  // ─── 查詢 API（給未來 admin endpoint 用）────────────────────────────────────

  /** 指定時間範圍的彙總（預設過去 30 天）*/
  async summary(sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await this.db
      .select({
        totalCalls: sql<number>`COUNT(*)::int`,
        totalTokens: sql<number>`COALESCE(SUM(total_tokens), 0)::int`,
        errorCalls: sql<number>`COUNT(*) FILTER (WHERE error_kind IS NOT NULL)::int`,
        cacheHits: sql<number>`COUNT(*) FILTER (WHERE cache_hit = true)::int`,
        avgLatency: sql<number>`COALESCE(AVG(latency_ms) FILTER (WHERE cache_hit = false AND error_kind IS NULL), 0)::int`,
      })
      .from(zaiCallLog)
      .where(gte(zaiCallLog.createdAt, since));
    return rows[0] ?? { totalCalls: 0, totalTokens: 0, errorCalls: 0, cacheHits: 0, avgLatency: 0 };
  }

  /** 各 promptKey/version 的用量 breakdown */
  async byPromptVersion(sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    return this.db
      .select({
        promptKey: zaiCallLog.promptKey,
        promptVersion: zaiCallLog.promptVersion,
        calls: sql<number>`COUNT(*)::int`,
        sumTokens: sql<number>`COALESCE(SUM(total_tokens), 0)::int`,
        errors: sql<number>`COUNT(*) FILTER (WHERE error_kind IS NOT NULL)::int`,
      })
      .from(zaiCallLog)
      .where(and(gte(zaiCallLog.createdAt, since), isNotNull(zaiCallLog.promptKey)))
      .groupBy(zaiCallLog.promptKey, zaiCallLog.promptVersion);
  }

  /** error kind 分佈 */
  async errorBreakdown(sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    return this.db
      .select({
        errorKind: zaiCallLog.errorKind,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(zaiCallLog)
      .where(and(gte(zaiCallLog.createdAt, since), isNotNull(zaiCallLog.errorKind)))
      .groupBy(zaiCallLog.errorKind);
  }
}
