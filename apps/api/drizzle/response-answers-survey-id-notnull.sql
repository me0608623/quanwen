-- response_answers.survey_id 設為 NOT NULL（先決:已跑過 response-answers-survey-id.sql 並完成回填）。
-- 加 NULL 守衛:有殘留則 abort,提示先跑回填 migration。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM response_answers WHERE survey_id IS NULL) THEN
    RAISE EXCEPTION 'response_answers 有 survey_id IS NULL 殘留 — 請先跑 response-answers-survey-id.sql 完成批次回填。';
  END IF;
END $$;

ALTER TABLE response_answers ALTER COLUMN survey_id SET NOT NULL;
