import { z } from 'zod';

// 生成可指定的題型（含學術量表變體）。
// scale_agreement / scale_frequency 最終會 normalize 成帶固定錨點的 rating 題。
export const GenQuestionTypeEnum = z.enum([
  'single_choice',
  'multiple_choice',
  'text',
  'rating',
  'scale_agreement', // 李克特同意度：非常不同意 → 非常同意（0~5）
  'scale_frequency', // 頻率：從來沒有 → 總是如此（0~5）
]);

export const AiDraftSchema = z.object({
  topic: z.string().min(2).max(200),
  // Phase II.12: 使用者想達成的目的 / 想了解什麼（讓 AI 生得更貼題）
  purpose: z.string().max(500).optional(),
  questionCount: z.number().int().min(3).max(20).default(8),
  language: z.enum(['zh-TW', 'en']).default('zh-TW'),
  targetAudience: z.string().max(200).optional(),
  // Phase II.13: 建立者想要的題型偏好（AI 會優先使用這些題型）。
  // 空 / 未給 → AI 自由混搭。（向後相容；typeSpecs 存在時以 typeSpecs 為準）
  preferredTypes: z
    .array(z.enum(['single_choice', 'multiple_choice', 'text', 'rating']))
    .max(4)
    .optional(),
  // Phase II.15: 逐題型指定題數。例：單選 3 題 + 同意度量表 5 題。
  // 給了 typeSpecs → AI 必須照各型數量生成，總題數 = 各 count 加總。
  typeSpecs: z
    .array(
      z.object({
        type: GenQuestionTypeEnum,
        count: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(6)
    .optional(),
  // Phase II.14: 換個角度再生 — 帶上一版題目，AI 會換角度避免重複
  avoidTitles: z.array(z.string().max(1000)).max(50).optional(),
});

export type AiDraftDto = z.infer<typeof AiDraftSchema>;
export type GenQuestionType = z.infer<typeof GenQuestionTypeEnum>;
