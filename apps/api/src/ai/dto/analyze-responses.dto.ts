import { z } from 'zod';

export const AiAnalyzeResponsesSchema = z.object({
  surveyId: z.string().uuid(),
  reportType: z.enum(['simple', 'detailed']).default('simple'),
});

export type AiAnalyzeResponsesDto = z.infer<typeof AiAnalyzeResponsesSchema>;
