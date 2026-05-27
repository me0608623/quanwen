-- Phase C-2: 發問卷方可決定是否導入 AI 審核
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS ai_review_enabled BOOLEAN NOT NULL DEFAULT true;
