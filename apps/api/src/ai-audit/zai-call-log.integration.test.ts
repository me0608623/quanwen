/**
 * Phase II.11: ZaiCallLogService DB 持久化整合測試
 *
 * 真實 PGlite。驗證：
 *  1. registerSink 後，zaiTelemetry.record() 會落地到 zai_call_log
 *  2. summary() 彙總正確（含 error/cache 過濾）
 *  3. byPromptVersion() / errorBreakdown() 聚合正確
 *  4. DB 寫入失敗不影響 record() 主流程（sink 吞錯）
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';

import * as schema from '../db/schema';
import { ZaiCallLogService } from './zai-call-log.service';
import { zaiTelemetry, type TelemetryRecord } from './telemetry';

function rec(over: Partial<TelemetryRecord> = {}): TelemetryRecord {
  return {
    ts: Date.now(),
    promptKey: 'quality_audit.holistic_judge',
    promptVersion: '1.0.0',
    promptTokens: 70,
    completionTokens: 30,
    totalTokens: 100,
    latencyMs: 800,
    attempts: 1,
    finishReason: 'stop',
    cacheHit: false,
    ...over,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 30)); // 等 fire-and-forget insert

describe('ZaiCallLogService (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ZaiCallLogService;
  let unregister: (() => void) | null = null;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TABLE zai_call_log (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        model             VARCHAR(64) NOT NULL,
        prompt_key        VARCHAR(100),
        prompt_version    VARCHAR(32),
        prompt_tokens     INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens      INTEGER NOT NULL DEFAULT 0,
        latency_ms        INTEGER NOT NULL DEFAULT 0,
        attempts          INTEGER NOT NULL DEFAULT 1,
        finish_reason     VARCHAR(32) NOT NULL,
        error_kind        VARCHAR(32),
        cache_hit         BOOLEAN NOT NULL DEFAULT false,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    db = drizzle(client, { schema });
    service = new ZaiCallLogService(db as never);
  });

  beforeEach(async () => {
    // 每個 case 前清空 table + 重置 aggregator + 重新註冊 sink
    await client.exec('DELETE FROM zai_call_log;');
    zaiTelemetry.reset();
    unregister?.();
    service.onModuleInit();
    // onModuleInit 內部會 registerSink；記下 unregister 供清理
    unregister = () => service.onModuleDestroy();
  });

  afterAll(async () => {
    service.onModuleDestroy();
    await client?.close();
  });

  it('1. record() 後落地到 zai_call_log', async () => {
    zaiTelemetry.record(rec({ totalTokens: 150 }));
    await tick();

    const rows = await db.select().from(schema.zaiCallLog);
    expect(rows.length).toBe(1);
    expect(rows[0]?.totalTokens).toBe(150);
    expect(rows[0]?.promptKey).toBe('quality_audit.holistic_judge');
    expect(rows[0]?.cacheHit).toBe(false);
  });

  it('2. summary() 彙總：排除 cache/error 後算 avgLatency', async () => {
    zaiTelemetry.record(rec({ totalTokens: 100, latencyMs: 1000 }));
    zaiTelemetry.record(rec({ totalTokens: 200, latencyMs: 2000 }));
    zaiTelemetry.record(rec({ totalTokens: 0, latencyMs: 0, cacheHit: true, finishReason: 'cache_hit' }));
    zaiTelemetry.record(rec({ totalTokens: 0, latencyMs: 50000, errorKind: 'timeout', finishReason: 'error' }));
    await tick();

    const s = await service.summary();
    expect(s.totalCalls).toBe(4);
    expect(s.totalTokens).toBe(300);
    expect(s.errorCalls).toBe(1);
    expect(s.cacheHits).toBe(1);
    // avgLatency 只算 2 筆 real call (1000, 2000) → 1500，不含 cache(0) / error(50000)
    expect(s.avgLatency).toBe(1500);
  });

  it('3. byPromptVersion() 分組聚合', async () => {
    zaiTelemetry.record(rec({ promptKey: 'a.x', promptVersion: '1.0.0', totalTokens: 100 }));
    zaiTelemetry.record(rec({ promptKey: 'a.x', promptVersion: '1.0.0', totalTokens: 50 }));
    zaiTelemetry.record(rec({ promptKey: 'a.x', promptVersion: '2.0.0', totalTokens: 80 }));
    await tick();

    const rows = await service.byPromptVersion();
    const v1 = rows.find((r) => r.promptVersion === '1.0.0');
    const v2 = rows.find((r) => r.promptVersion === '2.0.0');
    expect(v1?.calls).toBe(2);
    expect(v1?.sumTokens).toBe(150);
    expect(v2?.calls).toBe(1);
    expect(v2?.sumTokens).toBe(80);
  });

  it('4. errorBreakdown() 只算 error 且分組', async () => {
    zaiTelemetry.record(rec({ errorKind: 'timeout', finishReason: 'error' }));
    zaiTelemetry.record(rec({ errorKind: 'timeout', finishReason: 'error' }));
    zaiTelemetry.record(rec({ errorKind: 'http_5xx', finishReason: 'error' }));
    zaiTelemetry.record(rec()); // success, 不該計入
    await tick();

    const rows = await service.errorBreakdown();
    const timeout = rows.find((r) => r.errorKind === 'timeout');
    const http5xx = rows.find((r) => r.errorKind === 'http_5xx');
    expect(timeout?.count).toBe(2);
    expect(http5xx?.count).toBe(1);
    expect(rows.length).toBe(2); // 只有 2 種 error kind
  });

  it('5. sink 寫入失敗不影響 record() — aggregator 仍正常', async () => {
    // 用壞掉的 db（table drop 掉）模擬寫入失敗
    await client.exec('DROP TABLE zai_call_log;');

    // record 不該 throw
    expect(() => zaiTelemetry.record(rec())).not.toThrow();
    await tick();

    // aggregator in-memory snapshot 仍記到這筆
    const snap = zaiTelemetry.snapshot();
    expect(snap.totalCalls).toBeGreaterThanOrEqual(1);

    // 還原 table 給 afterAll/後續
    await client.exec(`
      CREATE TABLE zai_call_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model VARCHAR(64) NOT NULL,
        prompt_key VARCHAR(100), prompt_version VARCHAR(32),
        prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 1, finish_reason VARCHAR(32) NOT NULL,
        error_kind VARCHAR(32), cache_hit BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  });
});
