-- 歡迎頁（作答第一頁）可插入的多張圖片，依陣列順序顯示於描述之後
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS welcome_images jsonb;
