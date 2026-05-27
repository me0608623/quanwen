-- Phase C-1: 每日轉盤
CREATE TABLE IF NOT EXISTS spin_records (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prize_key  VARCHAR(40) NOT NULL,
  points_won INTEGER NOT NULL,
  spin_date  VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spin_records_user_idx ON spin_records(user_id);
-- 一個 user 一天只能一筆 (DB 層防重)
CREATE UNIQUE INDEX IF NOT EXISTS spin_records_user_date_unique ON spin_records(user_id, spin_date);
