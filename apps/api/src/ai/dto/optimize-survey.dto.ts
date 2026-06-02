import { z } from 'zod';

export const AiOptimizeSurveySchema = z.object({
  surveyId: z.string().uuid(),
});

export type AiOptimizeSurveyDto = z.infer<typeof AiOptimizeSurveySchema>;
