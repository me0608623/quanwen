import type { RespondentProfile } from '@/hooks/use-profile';

type CompletenessInput = Pick<
  RespondentProfile,
  'ageRange' | 'gender' | 'region' | 'occupation' | 'industry' | 'education' | 'tags'
>;

/**
 * 受試者資料完整度：填越多受眾欄位 → 越容易被媒合到問卷。
 * 計入 6 個受眾欄位 + 是否有興趣標籤，共 7 項。
 */
export function profileCompleteness(p: CompletenessInput): {
  percent: number;
  filled: number;
  total: number;
} {
  const checks: Array<unknown> = [
    p.ageRange,
    p.gender,
    p.region,
    p.occupation,
    p.industry,
    p.education,
    (p.tags?.length ?? 0) > 0 ? 'has-tags' : null,
  ];
  const total = checks.length;
  const filled = checks.filter((v) => v !== null && v !== undefined && v !== '').length;
  return { percent: Math.round((filled / total) * 100), filled, total };
}
