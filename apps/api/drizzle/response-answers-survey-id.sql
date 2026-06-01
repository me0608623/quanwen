-- response_answers 加 survey_id 反正規化（設計文件 §3-B1、ADR-009）。
-- nullable 暫存：所有寫入路徑(responses.service / mutual.service)已同步回填；
--   既有資料用分批 UPDATE 回填。日後另一次 migration 再 SET NOT NULL。
-- 重複套用安全。

ALTER TABLE response_answers
  ADD COLUMN IF NOT EXISTS survey_id uuid REFERENCES surveys(id) ON DELETE CASCADE;

-- 分批回填（每批 1 萬列 + pg_sleep 讓 autovacuum 跟上）。對既有資料一次性。
DO $$
DECLARE rows_affected INT := 1;
BEGIN
  WHILE rows_affected > 0 LOOP
    WITH batch AS (
      SELECT ra.id, sr.survey_id AS sid
        FROM response_answers ra
        JOIN survey_responses sr ON sr.id = ra.response_id
       WHERE ra.survey_id IS NULL
       LIMIT 10000
    )
    UPDATE response_answers ra
       SET survey_id = batch.sid
      FROM batch
     WHERE ra.id = batch.id;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;

-- per-survey 聚合查詢的 covering index（刻意不納 text_answer 避免膨脹）。
CREATE INDEX IF NOT EXISTS response_answers_survey_question_idx
  ON response_answers (survey_id, question_id)
  INCLUDE (selected_option_ids, rating_value);

-- production 線上大表：上述 ALTER 與 CREATE INDEX 請改 CONCURRENTLY 版獨立執行。
