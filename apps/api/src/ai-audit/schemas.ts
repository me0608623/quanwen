import { z } from 'zod';

/**
 * Phase II.2: AI LLM 輸出的 Zod schema 集中地。
 *
 * 動機：LLM 即使被嚴格 prompt，仍可能：
 *   - 給 sincerity_score = 150（超出 0-100 範圍）
 *   - recommendation = "需人工審查"（中文，不在 enum）
 *   - evidence = "..."（字串而非 array）
 *   - 多塞 markdown / 多餘欄位
 *
 * 用 Zod parse 一次就能：
 *   1. clip 數值到合法範圍
 *   2. unknown recommendation → 退回 'manual_review'（保守）
 *   3. evidence 不是 array → 轉成空 array
 *   4. 額外欄位忽略
 *
 * 每個 schema 都 export `parse*` helper：失敗時 throw with debug 描述。
 */

// ─── Holistic judge（quality-audit 灰區 LLM 評分）─────────────────────────────

const recommendationSchema = z
  .union([
    z.literal('approve'),
    z.literal('manual_review'),
    z.literal('reject'),
  ])
  .catch('manual_review' as const);

export const holisticJudgeSchema = z
  .object({
    // sincerity_score 缺失/出界自動 fallback 到 0（最保守 — 0 分 = rejected）
    sincerity_score: z.preprocess(
      (v) => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }
        return 0;
      },
      z.number().min(0).max(100).catch(0),
    ),

    primary_concern: z.string().max(500).optional().catch(undefined),

    evidence: z
      .array(z.string().max(200))
      .max(10)
      .optional()
      .catch([] as string[])
      .transform((arr) => arr ?? []),

    recommendation: recommendationSchema.optional(),

    summary: z.string().max(500).optional().catch(undefined),
  })
  // 額外欄位忽略
  .passthrough();

export type HolisticJudgeOutput = z.infer<typeof holisticJudgeSchema>;

export function parseHolisticJudge(raw: unknown): HolisticJudgeOutput {
  return holisticJudgeSchema.parse(raw);
}

// ─── Withdrawal risk（admin/withdrawal-risk.service）─────────────────────────

const riskLevelSchema = z
  .union([z.literal('low'), z.literal('medium'), z.literal('high')])
  .catch('medium' as const);

const recommendationRiskSchema = z
  .union([
    z.literal('approve'),
    z.literal('manual_review'),
    z.literal('reject'),
  ])
  .catch('manual_review' as const);

export const withdrawalRiskSchema = z
  .object({
    riskLevel: riskLevelSchema,
    redFlags: z
      .array(z.string().max(50))
      .max(10)
      .catch([] as string[])
      .transform((arr) => arr ?? []),
    recommendation: recommendationRiskSchema,
    reasoning: z
      .string()
      .max(500)
      .or(z.unknown().transform(() => 'AI 結果格式異常，建議人工審查'))
      .catch('AI 結果格式異常，建議人工審查'),
  })
  .passthrough();

export type WithdrawalRiskOutput = z.infer<typeof withdrawalRiskSchema>;

export function parseWithdrawalRisk(raw: unknown): WithdrawalRiskOutput {
  return withdrawalRiskSchema.parse(raw);
}

// ─── Platform health summary（admin/platform-health.service）─────────────────

const platformStatusSchema = z
  .union([
    z.literal('healthy'),
    z.literal('attention'),
    z.literal('critical'),
  ])
  .catch('attention' as const);

export const platformHealthSchema = z
  .object({
    status: platformStatusSchema,
    headline: z.string().max(100).catch('平台健康度評估中'),
    highlights: z
      .array(z.string().max(50))
      .max(4)
      .catch([])
      .transform((arr) => arr ?? []),
    concerns: z
      .array(z.string().max(50))
      .max(4)
      .catch([])
      .transform((arr) => arr ?? []),
    suggestedActions: z
      .array(z.string().max(50))
      .max(4)
      .catch([])
      .transform((arr) => arr ?? []),
  })
  .passthrough();

export type PlatformHealthOutput = z.infer<typeof platformHealthSchema>;

export function parsePlatformHealth(raw: unknown): PlatformHealthOutput {
  return platformHealthSchema.parse(raw);
}

// ─── Anti-hallucination grounding system prompt suffix ──────────────────────

/**
 * 通用的 anti-hallucination 後綴。任何 LLM 評分類 prompt 都應該 append 這段。
 *
 * 原則：
 * - 不准編造未提供的事實
 * - 不准用「常識」推論超出 input 的人事物
 * - 不確定時必須走 manual_review（保守）
 * - 評分必須引用 input 中具體訊號
 */
export const GROUNDING_SUFFIX = `

—— 接地原則（必須遵守，違反視同無效輸出）——
1. 你的判斷**只能基於 input 中明確列出的訊號**。不准用「常識」「一般而言」「通常」等補充未列出的資訊。
2. evidence 內每一條必須引用具體題號 / 行為訊號數值 / 答案片段，不可空泛敘述。
3. 若 input 訊號不足以判斷，sincerity_score 給 60（不確定中位數），recommendation 給 "manual_review"。
4. 禁止猜測受試者身份、職業、動機；禁止對未提供的人口統計做推論。
5. score 必須在 0-100 整數範圍內；超出範圍視同錯誤。
`;
