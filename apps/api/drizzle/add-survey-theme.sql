-- 問卷樣式主題：accentColor / backgroundColor / fontFamily（套用到填答頁與預覽）
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS theme jsonb;
