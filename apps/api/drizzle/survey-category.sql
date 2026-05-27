-- Phase B+ : 問卷分類, 用於 mutual 媒合 + task list 篩選
-- 套用方式: docker exec -i quanwen_postgres psql -U quanwen -d quanwen_dev < survey-category.sql

DO $$ BEGIN
  CREATE TYPE survey_category AS ENUM (
    'consumer',      -- 消費者行為 / 市場調查
    'academic',      -- 學術研究 / 論文
    'wellness',      -- 健康 / 健身 / 心理
    'workplace',     -- 工作 / 職場
    'lifestyle',     -- 生活風格 / 興趣
    'tech',          -- 科技 / 產品使用
    'social',        -- 社會議題 / 政治
    'education',     -- 教育 / 學習
    'finance',       -- 金融 / 投資
    'other'          -- 其他
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS category survey_category;

CREATE INDEX IF NOT EXISTS surveys_category_idx ON surveys(category) WHERE category IS NOT NULL;
