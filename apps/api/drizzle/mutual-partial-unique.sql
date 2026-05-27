-- Phase B 修正：把 mutual_pairs.a_survey_id 的全表 UNIQUE 改成只對 active 狀態唯一
-- 這樣 cancelled / expired / both_done 的 pair 不會擋住 a_survey_id 重新進池

ALTER TABLE mutual_pairs DROP CONSTRAINT IF EXISTS mutual_pairs_a_survey_unique;

CREATE UNIQUE INDEX IF NOT EXISTS mutual_pairs_a_survey_active_unique
  ON mutual_pairs (a_survey_id)
  WHERE status IN ('waiting','matched','a_done','b_done');
