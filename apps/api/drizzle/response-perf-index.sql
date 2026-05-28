-- P0 規模化索引（見「問卷資料儲存與規模化設計.md §3-A」+ ADR-009）
-- 名稱與 db:push 慣例一致 + IF NOT EXISTS → 重複套用安全。
-- ⚠️ 線上大表請改用 CONCURRENTLY（見每段註解的 production 版；CONCURRENTLY 不能在 transaction 內，須獨立執行）。
-- 欄位名對齊 Drizzle（apps/api/src/db/schema/{surveys,responses}.ts）。

-- ── A-1: 任務列表熱查詢 partial covering ──────────────────────────────
-- getAvailableSurveys: WHERE status='published' AND type='standard'
--                      ORDER BY reward_points DESC, published_at DESC
-- partial(status='published') 固定 WHERE，並把排序欄納入 → index scan 直接回有序結果，免 filesort。
-- 註: surveys 無 deleted_at 欄，勿加該條件。
CREATE INDEX IF NOT EXISTS surveys_task_list_idx
  ON surveys (status, type, reward_points DESC, published_at DESC)
  WHERE status = 'published';
-- production: CREATE INDEX CONCURRENTLY IF NOT EXISTS surveys_task_list_idx
--   ON surveys (status, type, reward_points DESC, published_at DESC) WHERE status = 'published';

-- ── A-3: survey_responses per-survey + status covering ────────────────
-- getSurveyStats: WHERE survey_id=? AND status IN ('submitted','rewarded','rejected')
-- (survey_id,status) 複合 + INCLUDE 常用聚合欄 → 免 heap fetch。
CREATE INDEX IF NOT EXISTS survey_responses_survey_status_idx
  ON survey_responses (survey_id, status)
  INCLUDE (quality_score, submitted_at);
-- production: 同上加 CONCURRENTLY。

-- ── A-2: response_answers 取答案 covering ─────────────────────────────
-- per-survey 統計批次取答案（inArray(responseIds)）。INCLUDE 量化欄避免 heap fetch。
-- 刻意【不】INCLUDE text_answer：開放題文字可能很長，納入會嚴重膨脹索引；
--   文字樣本走 heap 回表即可（取樣量小）。
CREATE INDEX IF NOT EXISTS response_answers_response_covering_idx
  ON response_answers (response_id)
  INCLUDE (question_id, selected_option_ids, rating_value);
-- production: 同上加 CONCURRENTLY。
