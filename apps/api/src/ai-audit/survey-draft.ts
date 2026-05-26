import { z } from 'zod';

/**
 * Phase II.12: AI 一鍵生成問卷 — LLM 輸出的 Zod 解析 + normalize。
 *
 * 為什麼需要 normalize（不是只 parse）：
 * LLM 生問卷的輸出比評分類更「髒」，常見問題：
 *   - single_choice 只給 1 個選項（單選需 ≥2）
 *   - text / rating 題硬塞 options
 *   - rating 忘了給 maxRating
 *   - 選項 label 重複
 *   - matrix 沒給 rows/columns 結構
 *   - 題數超過使用者要求
 *   - 空 title 的題目
 *
 * parse（lenient Zod）先把型別救回來；normalize 再把「結構上不合法」的題目
 * 修成可直接存進 DB（符合 CreateSurveySchema）的乾淨版本。
 */

// 生成只支援這 4 種常見題型；matrix 結構複雜，normalize 會把壞掉的 matrix 降級
const GEN_QUESTION_TYPES = ['single_choice', 'multiple_choice', 'text', 'rating'] as const;
type GenQuestionType = (typeof GEN_QUESTION_TYPES)[number];

const rawOptionSchema = z
  .object({
    label: z.string().max(300).optional().catch(undefined),
  })
  .passthrough()
  // 允許 LLM 直接給字串 option（"選項A"）而非 {label}
  .or(z.string().transform((s) => ({ label: s })));

const rawQuestionSchema = z
  .object({
    type: z
      .enum(['single_choice', 'multiple_choice', 'text', 'rating', 'matrix'])
      .catch('text'),
    title: z.string().max(1000).optional().catch(undefined),
    description: z.string().max(500).optional().catch(undefined),
    isRequired: z.boolean().optional().catch(true),
    options: z.array(rawOptionSchema).max(30).optional().catch([]),
    config: z.record(z.unknown()).optional().catch(undefined),
  })
  .passthrough();

export const aiSurveyDraftSchema = z
  .object({
    title: z.string().max(200).optional().catch(undefined),
    description: z.string().max(2000).optional().catch(undefined),
    questions: z.array(rawQuestionSchema).max(60).optional().catch([]),
  })
  .passthrough();

export type RawAiSurveyDraft = z.infer<typeof aiSurveyDraftSchema>;

export function parseAiSurveyDraft(raw: unknown): RawAiSurveyDraft {
  return aiSurveyDraftSchema.parse(raw);
}

// ─── Normalize：把 parse 後的 raw draft 修成可存 DB 的乾淨結構 ────────────────

export interface NormalizedOption {
  label: string;
  sortOrder: number;
}

export interface NormalizedQuestion {
  type: GenQuestionType;
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  config?: Record<string, unknown>;
  options?: NormalizedOption[];
}

export interface NormalizedSurveyDraft {
  title: string;
  description?: string;
  questions: NormalizedQuestion[];
  /** normalize 過程中丟掉/修正了什麼，回給前端當「AI 草稿提醒」用 */
  notes: string[];
}

const MIN_CHOICE_OPTIONS = 2;
const MAX_CHOICE_OPTIONS = 8;
const DEFAULT_MAX_RATING = 5;

/**
 * @param raw   parseAiSurveyDraft 的結果
 * @param opts.maxQuestions 上限（依使用者要求；預設 20）
 */
export function normalizeSurveyDraft(
  raw: RawAiSurveyDraft,
  opts: { maxQuestions?: number } = {},
): NormalizedSurveyDraft {
  const notes: string[] = [];
  const maxQuestions = Math.max(1, Math.min(opts.maxQuestions ?? 20, 50));

  const title = raw.title?.trim() || '未命名問卷';
  if (!raw.title?.trim()) notes.push('AI 未提供標題，已套用預設值');

  const description = raw.description?.trim() || undefined;

  const rawQuestions = raw.questions ?? [];
  const normalized: NormalizedQuestion[] = [];

  for (const q of rawQuestions) {
    if (normalized.length >= maxQuestions) {
      notes.push(`題數超過上限 ${maxQuestions}，已截斷多餘題目`);
      break;
    }

    const title2 = q.title?.trim();
    if (!title2) {
      notes.push('略過一題：題目文字為空');
      continue;
    }

    let type = q.type as GenQuestionType | 'matrix';

    // matrix 結構複雜，若 config 沒給合法 rows/columns → 降級為 single_choice
    if (type === 'matrix') {
      const m = (q.config as { matrix?: { rows?: unknown; columns?: unknown } } | undefined)?.matrix;
      const validMatrix =
        Array.isArray(m?.rows) && Array.isArray(m?.columns) && m!.rows.length > 0 && m!.columns.length > 0;
      if (!validMatrix) {
        type = 'single_choice';
        notes.push(`「${title2.slice(0, 20)}」matrix 結構不完整，已降級為單選`);
      } else {
        // 合法 matrix 直接收（config 保留）
        normalized.push({
          type: 'single_choice', // DB enum 仍存原樣？matrix 需特殊處理；此處保守降級
          title: title2,
          description: q.description?.trim() || undefined,
          sortOrder: normalized.length,
          isRequired: q.isRequired ?? true,
          config: q.config,
        });
        continue;
      }
    }

    const isChoice = type === 'single_choice' || type === 'multiple_choice';

    if (isChoice) {
      // 整理選項：去空白、去重、cap
      const seen = new Set<string>();
      const cleanOptions: NormalizedOption[] = [];
      for (const o of q.options ?? []) {
        const label = (o as { label?: string }).label?.trim();
        if (!label) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleanOptions.push({ label: label.slice(0, 300), sortOrder: cleanOptions.length });
        if (cleanOptions.length >= MAX_CHOICE_OPTIONS) break;
      }

      if (cleanOptions.length < MIN_CHOICE_OPTIONS) {
        // 選項不足 → 降級為開放題（保留題目本身）
        normalized.push({
          type: 'text',
          title: title2,
          description: q.description?.trim() || undefined,
          sortOrder: normalized.length,
          isRequired: q.isRequired ?? true,
        });
        notes.push(`「${title2.slice(0, 20)}」選項不足 ${MIN_CHOICE_OPTIONS} 個，已改為開放題`);
        continue;
      }

      normalized.push({
        type,
        title: title2,
        description: q.description?.trim() || undefined,
        sortOrder: normalized.length,
        isRequired: q.isRequired ?? true,
        options: cleanOptions,
      });
      continue;
    }

    if (type === 'rating') {
      const rawMax = (q.config as { maxRating?: unknown } | undefined)?.maxRating;
      let maxRating = typeof rawMax === 'number' ? Math.round(rawMax) : DEFAULT_MAX_RATING;
      if (!Number.isFinite(maxRating) || maxRating < 3 || maxRating > 10) {
        maxRating = DEFAULT_MAX_RATING;
      }
      normalized.push({
        type: 'rating',
        title: title2,
        description: q.description?.trim() || undefined,
        sortOrder: normalized.length,
        isRequired: q.isRequired ?? true,
        config: { maxRating },
      });
      continue;
    }

    // text（含 matrix 已降級後不會到這）
    normalized.push({
      type: 'text',
      title: title2,
      description: q.description?.trim() || undefined,
      sortOrder: normalized.length,
      isRequired: q.isRequired ?? true,
    });
  }

  if (normalized.length === 0) {
    notes.push('AI 沒有生成任何有效題目，請調整主題描述後重試');
  }

  return { title: title.slice(0, 200), description, questions: normalized, notes };
}
