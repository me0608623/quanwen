-- P6: task list 熱查詢效能索引
-- 對應 drizzle schema apps/api/src/db/schema/surveys.ts 的 statusTypeIdx / categoryIdx。
-- 名稱與 db:push 產生的一致 + IF NOT EXISTS → 重複套用安全。
--
-- 加速的查詢（responses.service.ts getAvailableSurveys / getCategoryCounts）:
--   WHERE status = 'published' AND type = 'standard'
--   ORDER BY reward_points DESC, published_at DESC
-- 沒有 (status,type) 複合索引時,published 集合會被全掃再以 type 過濾。
--
-- 線上大表套用建議用 CONCURRENTLY（避免鎖表）:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS surveys_status_type_idx ON surveys (status, type);
-- （CONCURRENTLY 不能在 transaction 內,故獨立執行。）

CREATE INDEX IF NOT EXISTS surveys_status_type_idx ON surveys (status, type);
CREATE INDEX IF NOT EXISTS surveys_category_idx ON surveys (category);
