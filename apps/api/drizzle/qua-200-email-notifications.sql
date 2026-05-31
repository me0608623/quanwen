-- QUA-200: Auto email notification on survey completion
-- Adds email_opt_out to users and response_notif_mode to surveyor_profiles

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE response_notif_mode AS ENUM ('per_response', 'daily_digest');

ALTER TABLE surveyor_profiles
  ADD COLUMN IF NOT EXISTS response_notif_mode response_notif_mode NOT NULL DEFAULT 'per_response';
