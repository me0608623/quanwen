import { z } from 'zod';

export const UpdateSurveyorProfileSchema = z.object({
  institutionName: z.string().trim().min(1).max(200).optional(),
  researchPurpose: z.string().trim().min(1).max(500).optional(),
});

export type UpdateSurveyorProfileDto = z.infer<typeof UpdateSurveyorProfileSchema>;
