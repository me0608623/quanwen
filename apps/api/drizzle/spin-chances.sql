-- 轉盤改版：每日一次 → 完成問卷累積抽獎次數
-- 1) 新增抽獎次數餘額表
CREATE TABLE IF NOT EXISTS spin_chances (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available    integer NOT NULL DEFAULT 0,
  earned_total integer NOT NULL DEFAULT 0,
  spent_total  integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 2) 移除每日唯一限制（現在一天可轉多次，由 spin_chances 控管）
DROP INDEX IF EXISTS spin_records_user_date_unique;
CREATE INDEX IF NOT EXISTS spin_records_user_idx ON spin_records(user_id);
