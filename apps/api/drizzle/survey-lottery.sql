ALTER TABLE surveys ADD COLUMN IF NOT EXISTS reward_mode VARCHAR(16) NOT NULL DEFAULT 'fixed';
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_prize TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_winner_count INTEGER;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_draw_mode VARCHAR(16);
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_draw_at TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_drawn_at TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_draw_seed TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_eligible_digest TEXT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_terms_accepted_at TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS lottery_obligation_notified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS survey_lottery_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  prize TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT survey_lottery_results_unique UNIQUE (survey_id, respondent_id)
);

CREATE INDEX IF NOT EXISTS survey_lottery_results_survey_idx ON survey_lottery_results(survey_id);
CREATE INDEX IF NOT EXISTS survey_lottery_results_respondent_idx ON survey_lottery_results(respondent_id);

ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS fulfillment_status VARCHAR(24) NOT NULL DEFAULT 'not_applicable';
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS fulfillment_note TEXT;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS fulfillment_notified_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_verified_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_note TEXT;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_verified_notified_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_intervened_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_intervened_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_intervention_note TEXT;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_intervention_notified_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS platform_intervention_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS draw_notified_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS recipient_status VARCHAR(24) NOT NULL DEFAULT 'awaiting_delivery';
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS recipient_confirmed_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS recipient_confirmed_notified_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS recipient_issue_note TEXT;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS recipient_issue_reported_at TIMESTAMPTZ;
ALTER TABLE survey_lottery_results ADD COLUMN IF NOT EXISTS recipient_issue_notified_at TIMESTAMPTZ;

UPDATE survey_lottery_results
SET platform_intervention_history = jsonb_build_array(jsonb_build_object(
  'intervenedAt', platform_intervened_at,
  'adminId', platform_intervened_by,
  'reason', CASE WHEN recipient_status = 'issue_reported' THEN 'winner_issue' ELSE 'fulfillment_overdue' END,
  'note', platform_intervention_note
))
WHERE platform_intervention_note IS NOT NULL
  AND platform_intervention_history = '[]'::jsonb;
