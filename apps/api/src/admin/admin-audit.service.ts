import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { users, transactions, zaiCallLog } from '../db/schema';

// ─── AI 成本估算 ────────────────────────────────────────────────────────────
// Z.ai 牌價（USD / 1M tokens）。未知模型保守採 glm-5.1 價（寧可高估不低估）。
const MODEL_PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  'glm-5.1': { input: 1.4, output: 4.4 },
  'glm-4.6': { input: 0.6, output: 2.2 },
  'glm-4.5-air': { input: 0.2, output: 1.1 },
  'glm-4.5-flash': { input: 0, output: 0 },
  'glm-4.7-flash': { input: 0, output: 0 },
};
const DEFAULT_PRICING = MODEL_PRICING_USD_PER_M['glm-5.1'];
const USD_TO_TWD = 32.5;

function estCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING_USD_PER_M[model] ?? DEFAULT_PRICING;
  return (promptTokens * p.input + completionTokens * p.output) / 1_000_000;
}

export interface AdminTransactionParams {
  type?: string;
  status?: string;
  userId?: string;
  page: number;
  limit: number;
}

@Injectable()
export class AdminAuditService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  // ─── 交易稽核 ─────────────────────────────────────────────────────────────

  async listTransactions(params: AdminTransactionParams) {
    const { type, status, userId, page, limit } = params;

    const conditions = [];
    if (type) conditions.push(eq(transactions.type, type as typeof transactions.$inferSelect.type));
    if (status) conditions.push(eq(transactions.status, status as typeof transactions.$inferSelect.status));
    if (userId) conditions.push(eq(transactions.userId, userId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRows, items, summaryByType] = await Promise.all([
      this.db.select({ total: sql<number>`count(*)::int` }).from(transactions).where(where),
      this.db
        .select({
          id: transactions.id,
          userId: transactions.userId,
          userEmail: users.email,
          userDisplayName: users.displayName,
          type: transactions.type,
          amount: transactions.amount,
          status: transactions.status,
          note: transactions.note,
          externalProvider: transactions.externalProvider,
          externalRef: transactions.externalRef,
          relatedSurveyId: transactions.relatedSurveyId,
          createdAt: transactions.createdAt,
          completedAt: transactions.completedAt,
        })
        .from(transactions)
        .innerJoin(users, eq(users.id, transactions.userId))
        .where(where)
        .orderBy(desc(transactions.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({
          type: transactions.type,
          count: sql<number>`count(*)::int`,
          totalAmount: sql<number>`coalesce(sum(${transactions.amount}), 0)::int`,
        })
        .from(transactions)
        .where(where)
        .groupBy(transactions.type),
    ]);

    return { items, total: countRows[0]?.total ?? 0, page, limit, summaryByType };
  }

  // ─── AI 成本監控（zai_call_log 聚合）────────────────────────────────────────

  async getAiUsage(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceCond = gte(zaiCallLog.createdAt, since);

    const [totalsRows, byModelRows, byPromptKeyRows, dailyModelRows] = await Promise.all([
      this.db
        .select({
          calls: sql<number>`count(*)::int`,
          promptTokens: sql<number>`coalesce(sum(${zaiCallLog.promptTokens}), 0)::int`,
          completionTokens: sql<number>`coalesce(sum(${zaiCallLog.completionTokens}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${zaiCallLog.totalTokens}), 0)::int`,
          errors: sql<number>`count(*) filter (where ${zaiCallLog.errorKind} is not null)::int`,
          cacheHits: sql<number>`count(*) filter (where ${zaiCallLog.cacheHit})::int`,
        })
        .from(zaiCallLog)
        .where(sinceCond),
      this.db
        .select({
          model: zaiCallLog.model,
          calls: sql<number>`count(*)::int`,
          promptTokens: sql<number>`coalesce(sum(${zaiCallLog.promptTokens}), 0)::int`,
          completionTokens: sql<number>`coalesce(sum(${zaiCallLog.completionTokens}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${zaiCallLog.totalTokens}), 0)::int`,
        })
        .from(zaiCallLog)
        .where(sinceCond)
        .groupBy(zaiCallLog.model),
      this.db
        .select({
          promptKey: zaiCallLog.promptKey,
          calls: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${zaiCallLog.totalTokens}), 0)::int`,
          avgLatencyMs: sql<number>`coalesce(avg(${zaiCallLog.latencyMs}), 0)::int`,
          errors: sql<number>`count(*) filter (where ${zaiCallLog.errorKind} is not null)::int`,
        })
        .from(zaiCallLog)
        .where(sinceCond)
        .groupBy(zaiCallLog.promptKey),
      this.db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${zaiCallLog.createdAt}), 'YYYY-MM-DD')`,
          model: zaiCallLog.model,
          calls: sql<number>`count(*)::int`,
          promptTokens: sql<number>`coalesce(sum(${zaiCallLog.promptTokens}), 0)::int`,
          completionTokens: sql<number>`coalesce(sum(${zaiCallLog.completionTokens}), 0)::int`,
          totalTokens: sql<number>`coalesce(sum(${zaiCallLog.totalTokens}), 0)::int`,
        })
        .from(zaiCallLog)
        .where(sinceCond)
        .groupBy(sql`date_trunc('day', ${zaiCallLog.createdAt})`, zaiCallLog.model)
        .orderBy(sql`date_trunc('day', ${zaiCallLog.createdAt})`),
    ]);

    const totalsRaw = totalsRows[0] ?? {
      calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0, cacheHits: 0,
    };

    const byModel = byModelRows.map((r) => ({
      model: r.model,
      calls: r.calls,
      totalTokens: r.totalTokens,
      estCostUsd: round4(estCostUsd(r.model, r.promptTokens, r.completionTokens)),
    }));

    const totalCostUsd = byModel.reduce((s, m) => s + m.estCostUsd, 0);

    const byPromptKey = byPromptKeyRows.map((r) => ({
      promptKey: r.promptKey ?? '(未標記)',
      calls: r.calls,
      totalTokens: r.totalTokens,
      avgLatencyMs: r.avgLatencyMs,
      errorRate: r.calls > 0 ? round4(r.errors / r.calls) : 0,
    }));

    // 每日成本：先按 (日, 模型) 分組計價，再合併到日
    const dailyMap = new Map<string, { date: string; calls: number; totalTokens: number; estCostUsd: number }>();
    for (const r of dailyModelRows) {
      const entry = dailyMap.get(r.date) ?? { date: r.date, calls: 0, totalTokens: 0, estCostUsd: 0 };
      entry.calls += r.calls;
      entry.totalTokens += r.totalTokens;
      entry.estCostUsd = round4(entry.estCostUsd + estCostUsd(r.model, r.promptTokens, r.completionTokens));
      dailyMap.set(r.date, entry);
    }

    return {
      days,
      totals: {
        ...totalsRaw,
        estCostUsd: round4(totalCostUsd),
        estCostTwd: Math.round(totalCostUsd * USD_TO_TWD),
      },
      byModel,
      byPromptKey,
      daily: [...dailyMap.values()],
    };
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
