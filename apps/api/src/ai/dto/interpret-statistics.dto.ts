import { z } from 'zod';

export const AiInterpretStatisticsSchema = z.discriminatedUnion('analysisType', [
  z.object({
    surveyId: z.string().uuid(),
    analysisType: z.literal('group_comparison'),
    ratingQuestionId: z.string().uuid(),
    groupQuestionId: z.string().uuid(),
  }),
  z.object({
    surveyId: z.string().uuid(),
    analysisType: z.literal('regression'),
    dependentId: z.string().uuid(),
    independentIds: z.array(z.string().uuid()).min(1).max(10),
  }),
]);

export type AiInterpretStatisticsDto = z.infer<typeof AiInterpretStatisticsSchema>;
