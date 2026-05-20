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

export const CreateSurveySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
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
