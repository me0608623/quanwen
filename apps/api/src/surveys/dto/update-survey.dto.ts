import { z } from 'zod';
import { CreateSurveySchema } from './create-survey.dto';

export const UpdateSurveySchema = CreateSurveySchema.partial();
export type UpdateSurveyDto = z.infer<typeof UpdateSurveySchema>;
