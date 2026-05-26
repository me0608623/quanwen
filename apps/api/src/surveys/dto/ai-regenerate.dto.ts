import { z } from 'zod';

/**
 * Phase II.14: AI 單題重生。
 * 給問卷上下文 + 要重生的題目 + 可選調整方向 → AI 回單一新題目。
 */
export const RegenerateQuestionSchema = z.object({
  topic: z.string().min(2).max(200),
  purpose: z.string().max(500).optional(),
  // 要重生的原題目文字（讓 AI 知道在替換哪一題）
  currentTitle: z.string().max(1000),
  // 其他現有題目的標題（避免重生出重複的題）
  otherTitles: z.array(z.string().max(1000)).max(50).default([]),
  // 調整方向（如「換個問法」「改成評分題」「更具體」）
  direction: z.string().max(300).optional(),
  // 指定新題型（不給則 AI 自由決定）
  preferredType: z.enum(['single_choice', 'multiple_choice', 'text', 'rating']).optional(),
});

export type RegenerateQuestionDto = z.infer<typeof RegenerateQuestionSchema>;
