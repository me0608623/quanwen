import { z } from 'zod';

export const AiDraftSchema = z.object({
  topic: z.string().min(2).max(200),
  // Phase II.12: 使用者想達成的目的 / 想了解什麼（讓 AI 生得更貼題）
  purpose: z.string().max(500).optional(),
  questionCount: z.number().int().min(3).max(20).default(8),
  language: z.enum(['zh-TW', 'en']).default('zh-TW'),
  targetAudience: z.string().max(200).optional(),
  // Phase II.13: 建立者想要的題型偏好（AI 會優先使用這些題型）。
  // 空 / 未給 → AI 自由混搭。
  preferredTypes: z
    .array(z.enum(['single_choice', 'multiple_choice', 'text', 'rating']))
    .max(4)
    .optional(),
  // Phase II.14: 換個角度再生 — 帶上一版題目，AI 會換角度避免重複
  avoidTitles: z.array(z.string().max(1000)).max(50).optional(),
});

export type AiDraftDto = z.infer<typeof AiDraftSchema>;
