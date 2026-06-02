-- QUA-270: DB performance indexes for hot read paths
-- 1) Export/statistics queries filter by survey_id + status and often order by submitted_at
-- 2) Redemption history lists by user_id ordered by created_at desc

CREATE INDEX IF NOT EXISTS survey_responses_survey_status_submitted_idx
  ON survey_responses (survey_id, status, submitted_at);

CREATE INDEX IF NOT EXISTS point_redemptions_user_created_idx
  ON point_redemptions (user_id, created_at);
