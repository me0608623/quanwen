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

// 受眾鎖定條件（standard 問卷用）— 每個陣列為 OR、欄位間為 AND；空 = 不限
// 未知欄位由 Zod 預設 strip 掉，僅信任這裡列出的維度
export const AudienceCriteriaSchema = z.object({
  ageRange: z.array(z.string().max(20)).max(10).optional(),
  gender: z.array(z.string().max(20)).max(10).optional(),
  region: z.array(z.string().max(20)).max(30).optional(),
  occupation: z.array(z.string().max(30)).max(10).optional(),
  industry: z.array(z.string().max(40)).max(25).optional(),
  education: z.array(z.string().max(20)).max(10).optional(),
  minReputationScore: z.number().int().min(0).max(100).optional(),
  requiredTagIds: z.array(z.string().uuid()).max(20).optional(),
  tagMatchMode: z.enum(['any', 'all']).optional(),
});

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
  externalUrl: z.string().url().max(1000).refine(u => /^https?:\/\//i.test(u), { message: 'URL 必須使用 http 或 https 協議' }).optional(),
  rewardPoints: z.number().int().min(0).max(1000).default(0),
  targetCount: z.number().int().min(1).max(10000).default(100),
  expiresAt: z.string().datetime().optional(),
  // QUA-34: Rush delivery tier — controls rush multiplier on rewardPoints and default expiresAt
  // Optional; defaults to 'standard' (1.0x, 14 days) in SurveysService.create
  deadlineTier: z.enum(['standard', 'express', 'urgent', 'critical']).optional(),
  isAnonymous: z.boolean().default(true),
  audienceCriteria: AudienceCriteriaSchema.optional(),
  questions: z.array(SurveyQuestionSchema).max(50).optional(),
  // QUA-196: Skip Logic / Conditional Branching rules
  logicRules: z.array(z.object({
    triggerQuestionId: z.string().uuid(),
    condition: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 'is_empty', 'is_not_empty']),
    value: z.string().max(2000).optional(),
    action: z.enum(['show', 'hide', 'skip']).default('show'),
    targetQuestionId: z.string().uuid(),
    sortOrder: z.number().int().min(0).default(0),
  })).max(200).optional(),
});

export type CreateSurveyDto = z.infer<typeof CreateSurveySchema>;
export type SurveyQuestionDto = z.infer<typeof SurveyQuestionSchema>;
export type QuestionOptionDto = z.infer<typeof QuestionOptionSchema>;
