import { z } from 'zod';
import { AiInterpretStatisticsSchema } from './interpret-statistics.dto.js';

export const InterpretStatisticsBatchSchema = z.object({
  analyses: z.array(AiInterpretStatisticsSchema).min(1).max(7),
});

export type InterpretStatisticsBatchDto = z.infer<typeof InterpretStatisticsBatchSchema>;

export const POINTS_PER_AI_ANALYSIS = 10;

export interface BatchAnalysisCostPreview {
  total: number;
  aiCovered: number;
  pointsCovered: number;
  pointsRequired: number;
  pointsAvailable: number;
  canProceed: boolean;
}
