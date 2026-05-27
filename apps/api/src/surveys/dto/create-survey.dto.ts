import { z } from 'zod';

export const QuestionOptionSchema = z.object({
  label: z.string().min(1).max(300),
  sortOrder: z.number().int().min(0).default(0),
});

export const SurveyQuestionSchema = z.object({
  type: z.enum(['single_choice', 'multiple_choice', 'text', 'rating', 'matrix']),
  title: z.string().min(1).max(1000),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
  options: z.array(QuestionOptionSchema).max(20).optional(),
});

export const SURVEY_CATEGORIES = [
  'consumer', 'academic', 'wellness', 'workplace', 'lifestyle',
  'tech', 'social', 'education', 'finance', 'other',
] as const;

export const CreateSurveySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // standard = 走獎勵媒合；mutual = 互惠配對 (兩人互填)
  type: z.enum(['standard', 'mutual']).default('standard'),
  // 分類(optional): 提供 task list 過濾 + 未來 mutual 智慧媒合
  category: z.enum(SURVEY_CATEGORIES).optional(),
  // Phase C-2: 是否導入 AI 品質審核 (預設 true)
  aiReviewEnabled: z.boolean().default(true),
  // Phase C-3: mutual 用外部平台 (Google Forms 等) 時的連結
  externalUrl: z.string().url().max(1000).optional(),
  rewardPoints: z.number().int().min(0).max(1000).default(0),
  targetCount: z.number().int().min(1).max(10000).default(100),
  expiresAt: z.string().datetime().optional(),
  isAnonymous: z.boolean().default(true),
  audienceCriteria: z.record(z.unknown()).optional(),
  questions: z.array(SurveyQuestionSchema).max(50).optional(),
});

export type CreateSurveyDto = z.infer<typeof CreateSurveySchema>;
export type SurveyQuestionDto = z.infer<typeof SurveyQuestionSchema>;
export type QuestionOptionDto = z.infer<typeof QuestionOptionSchema>;
