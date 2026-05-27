-- 受試者新增「行業/職業類別」欄位（受眾媒合用，與就業狀態 occupation 為不同維度）
-- + industry='other' 時的自由填寫欄
-- 套用方式: docker exec -i quanwen_postgres psql -U quanwen -d quanwen_dev < profile-industry.sql

DO $$ BEGIN
  CREATE TYPE industry AS ENUM (
    'info_tech',                 -- 資訊科技 / 軟體
    'manufacturing',             -- 製造業
    'engineering_construction',  -- 工程 / 建築營造
    'healthcare',                -- 醫療 / 生技
    'education',                 -- 教育 / 學術研究
    'finance',                   -- 金融 / 保險 / 會計
    'legal',                     -- 法律
    'public_sector',             -- 公務 / 軍警消
    'service',                   -- 服務業
    'food_beverage',             -- 餐飲
    'hospitality_travel',        -- 旅宿 / 觀光
    'retail_wholesale',          -- 零售 / 批發
    'transport_logistics',       -- 運輸 / 物流
    'agriculture',               -- 農林漁牧
    'arts_media',                -- 藝術 / 設計 / 媒體
    'marketing_pr',              -- 行銷 / 公關 / 廣告
    'nonprofit',                 -- 非營利組織 / NGO
    'freelance',                 -- 自由接案
    'student',                   -- 學生
    'other'                      -- 其他（搭配 industry_other 自由填寫）
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE respondent_profiles ADD COLUMN IF NOT EXISTS industry industry;
ALTER TABLE respondent_profiles ADD COLUMN IF NOT EXISTS industry_other varchar(50);

CREATE INDEX IF NOT EXISTS respondent_profiles_industry_idx
  ON respondent_profiles(industry) WHERE industry IS NOT NULL;
