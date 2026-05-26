import { z } from 'zod';

export const AiDraftSchema = z.object({
  topic: z.string().min(2).max(200),
  // Phase II.12: 使用者想達成的目的 / 想了解什麼（讓 AI 生得更貼題）
  purpose: z.string().max(500).optional(),
  questionCount: z.number().int().min(3).max(20).default(8),
  language: z.enum(['zh-TW', 'en']).default('zh-TW'),
  targetAudience: z.string().max(200).optional(),
});

export type AiDraftDto = z.infer<typeof AiDraftSchema>;
