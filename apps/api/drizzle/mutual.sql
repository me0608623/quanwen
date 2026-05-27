-- Phase B-1: mutual surveys migration
-- 套用方式：docker exec -i quanwen_postgres psql -U quanwen -d quanwen_dev < mutual.sql

DO $$ BEGIN
  CREATE TYPE survey_type AS ENUM ('standard','mutual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE mutual_pair_status AS ENUM ('waiting','matched','a_done','b_done','both_done','expired','cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS type survey_type NOT NULL DEFAULT 'standard';

CREATE TABLE IF NOT EXISTS mutual_pairs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        mutual_pair_status NOT NULL DEFAULT 'waiting',

  a_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  a_survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  a_response_id UUID REFERENCES survey_responses(id) ON DELETE SET NULL,
  a_filled_at   TIMESTAMPTZ,

  b_user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  b_survey_id   UUID REFERENCES surveys(id) ON DELETE CASCADE,
  b_response_id UUID REFERENCES survey_responses(id) ON DELETE SET NULL,
  b_filled_at   TIMESTAMPTZ,

  matched_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mutual_pairs_a_survey_unique UNIQUE (a_survey_id)
);

CREATE INDEX IF NOT EXISTS mutual_pairs_status_idx  ON mutual_pairs(status);
CREATE INDEX IF NOT EXISTS mutual_pairs_a_user_idx  ON mutual_pairs(a_user_id);
CREATE INDEX IF NOT EXISTS mutual_pairs_b_user_idx  ON mutual_pairs(b_user_id);
