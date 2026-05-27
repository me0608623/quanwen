-- Phase C-3: 外部連結互惠問卷 + 截圖證明 + 互評信譽
-- surveys.external_url: 非空 → 這份 mutual 問卷是用外部平台 (Google Forms 等) 填
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS external_url TEXT;

-- mutual_pairs: 截圖證明 + 雙方互評 (A 評 B 存 a_rating, B 評 A 存 b_rating)
ALTER TABLE mutual_pairs ADD COLUMN IF NOT EXISTS a_proof_url TEXT;
ALTER TABLE mutual_pairs ADD COLUMN IF NOT EXISTS b_proof_url TEXT;
ALTER TABLE mutual_pairs ADD COLUMN IF NOT EXISTS a_rating INTEGER;   -- A 給 B 的評分 1-5
ALTER TABLE mutual_pairs ADD COLUMN IF NOT EXISTS b_rating INTEGER;   -- B 給 A 的評分 1-5
ALTER TABLE mutual_pairs ADD COLUMN IF NOT EXISTS a_rated_at TIMESTAMPTZ;
ALTER TABLE mutual_pairs ADD COLUMN IF NOT EXISTS b_rated_at TIMESTAMPTZ;
