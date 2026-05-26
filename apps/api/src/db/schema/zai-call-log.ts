import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Phase II.11: LLM call 持久化 telemetry。
 *
 * II.9 的 in-memory aggregator 重啟即失憶，只能看「這個 worker 近期」。
 * 這張表把每次 LLM call 落地，支援跨重啟 / 跨 worker 的成本與品質查詢：
 *   - 每月 LLM 花了多少 token（× 單價 = 成本）
 *   - 各 promptKey/version 的 latency 中位數、error rate
 *   - prompt A/B 兩版本的拒絕率差異（配合 telemetry 的 promptVersion）
 *
 * 寫入策略：fire-and-forget（不阻塞 LLM 主流程）。寫失敗只 log，不影響呼叫端。
 * 不存任何 prompt / response 內容 —— 只存 metadata（避免 PII 落地 + 控表大小）。
 */
export const zaiCallLog = pgTable(
  'zai_call_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    model: varchar('model', { length: 64 }).notNull(),
    promptKey: varchar('prompt_key', { length: 100 }),
    promptVersion: varchar('prompt_version', { length: 32 }),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    attempts: integer('attempts').notNull().default(1),
    finishReason: varchar('finish_reason', { length: 32 }).notNull(),
    // 有值表示這次 call 最終失敗（timeout/http_5xx/http_4xx/http_401/network/parse）
    errorKind: varchar('error_kind', { length: 32 }),
    cacheHit: boolean('cache_hit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('zai_call_log_created_idx').on(t.createdAt),
    promptKeyIdx: index('zai_call_log_prompt_key_idx').on(t.promptKey),
    errorIdx: index('zai_call_log_error_idx').on(t.errorKind),
  }),
);

export type ZaiCallLog = typeof zaiCallLog.$inferSelect;
export type NewZaiCallLog = typeof zaiCallLog.$inferInsert;
