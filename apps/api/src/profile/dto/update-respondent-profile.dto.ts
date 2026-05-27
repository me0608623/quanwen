import { z } from 'zod';

export const UpdateRespondentProfileSchema = z.object({
  ageRange: z.enum(['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus']).optional(),
  gender: z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']).optional(),
  region: z.string().trim().min(1).max(20).optional(),
  occupation: z.enum([
    'student', 'employed_full_time', 'employed_part_time',
    'self_employed', 'unemployed', 'retired', 'homemaker', 'other',
  ]).optional(),
  industry: z.enum([
    'info_tech', 'manufacturing', 'engineering_construction', 'healthcare',
    'education', 'finance', 'legal', 'public_sector', 'service', 'food_beverage',
    'hospitality_travel', 'retail_wholesale', 'transport_logistics', 'agriculture',
    'arts_media', 'marketing_pr', 'nonprofit', 'freelance', 'student', 'other',
  ]).optional(),
  industryOther: z.string().trim().max(50, '最多 50 字').optional(),
  education: z.enum([
    'junior_high', 'senior_high', 'vocational', 'bachelor', 'master', 'phd', 'other',
  ]).optional(),
  tagIds: z.array(z.string().uuid()).max(10, '最多選 10 個標籤').optional(),
});

export type UpdateRespondentProfileDto = z.infer<typeof UpdateRespondentProfileSchema>;
