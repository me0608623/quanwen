import { z } from 'zod';

export const AiDraftSchema = z.object({
  topic: z.string().min(2).max(200),
  questionCount: z.number().int().min(3).max(20).default(8),
  language: z.enum(['zh-TW', 'en']).default('zh-TW'),
  targetAudience: z.string().max(200).optional(),
});

export type AiDraftDto = z.infer<typeof AiDraftSchema>;
