import { z } from 'zod';

// 單題答案
export const AnswerSchema = z.object({
  questionId: z.string().uuid(),
  // text / matrix
  textAnswer: z.string().max(5000).optional(),
  // single_choice / multiple_choice
  selectedOptionIds: z.array(z.string().uuid()).max(20).optional(),
  // rating
  ratingValue: z.number().int().min(1).max(10).optional(),
});

// Phase 2: behavior tracker log（quality audit pipeline 用）
export const BehaviorLogSchema = z.object({
  startedAt: z.string(),
  submittedAt: z.string().optional(),
  totalDurationMs: z.number().int().min(0),
  windowSwitchCount: z.number().int().min(0),
  totalHiddenMs: z.number().int().min(0),
  pasteEventCount: z.number().int().min(0),
  totalKeystrokes: z.number().int().min(0),
  mouseMoveCount: z.number().int().min(0),
  perQuestionTimeMs: z.record(z.string(), z.number().int().min(0)),
  userAgent: z.string().max(500),
}).partial({ submittedAt: true });

export const SubmitResponseSchema = z.object({
  answers: z.array(AnswerSchema).min(1).max(100),
  // 客戶端記錄的開始填答時間（ISO string），用於反作弊計算
  startedAt: z.string().datetime().optional(),
  // Phase 2 behavior log
  behaviorLog: BehaviorLogSchema.optional(),
});

export type AnswerDto = z.infer<typeof AnswerSchema>;
export type BehaviorLogDto = z.infer<typeof BehaviorLogSchema>;
export type SubmitResponseDto = z.infer<typeof SubmitResponseSchema> & { startedAt?: string };
