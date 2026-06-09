import { z } from 'zod';

const uuid = z.string().uuid();
const uuidList = z.array(uuid).min(1).max(10);

export const AiInterpretStatisticsSchema = z.discriminatedUnion('analysisType', [
  z.object({
    surveyId: uuid,
    analysisType: z.literal('cross_tab'),
    questionA: uuid,
    questionB: uuid,
  }),
  z.object({
    surveyId: uuid,
    analysisType: z.literal('scale_reliability'),
    questionIds: z.array(uuid).max(10).optional(),
    reverseQuestionIds: z.array(uuid).max(10).optional(),
  }),
  z.object({
    surveyId: uuid,
    analysisType: z.literal('nps'),
    questionId: uuid,
  }),
  z.object({
    surveyId: uuid,
    analysisType: z.literal('correlation'),
    questionA: uuid,
    questionB: uuid,
  }),
  z.object({
    surveyId: uuid,
    analysisType: z.literal('group_comparison'),
    ratingQuestionId: uuid,
    groupQuestionId: uuid,
  }),
  z.object({
    surveyId: uuid,
    analysisType: z.literal('regression'),
    dependentId: uuid,
    independentIds: uuidList,
  }),
  z.object({
    surveyId: uuid,
    analysisType: z.literal('segmentation'),
    k: z.number().int().min(2).max(10).optional(),
  }),
]);

export type AiInterpretStatisticsDto = z.infer<typeof AiInterpretStatisticsSchema>;
