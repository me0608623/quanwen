-- ============================================================
-- 手動 migration：積分制度 + 問卷獎勵類型
-- 執行方式：psql $DATABASE_URL -f this_file.sql
-- ============================================================

-- 1. transaction_type enum 加入積分相關類型
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'points_in';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'points_spend';

-- 2. 建立 reward_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reward_type') THEN
    CREATE TYPE reward_type AS ENUM ('cash', 'points');
  END IF;
END$$;

-- 3. surveys 表加入 reward_type 欄位（預設 cash，不影響現有資料）
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS reward_type reward_type NOT NULL DEFAULT 'cash';

-- 4. wallets 確認 points_balance 欄位存在（已在 schema 定義，確認即可）
-- ALTER TABLE wallets ADD COLUMN IF NOT EXISTS points_balance integer NOT NULL DEFAULT 0;

-- 5. 積分不可為負的 CHECK constraint（若尚未存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'positive_balance' AND conrelid = 'wallets'::regclass
  ) THEN
    ALTER TABLE wallets
      ADD CONSTRAINT positive_balance
      CHECK (cash_balance >= 0 AND locked_cash >= 0 AND points_balance >= 0);
  END IF;
END$$;
