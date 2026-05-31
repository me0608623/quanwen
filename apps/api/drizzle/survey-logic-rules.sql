-- QUA-196: Skip Logic / Conditional Branching
-- Survey logic rules table for conditional question visibility and navigation

-- Condition enum: comparison operators for trigger evaluation
CREATE TYPE logic_condition AS ENUM (
  'eq',           -- equals (text exact match / single choice option ID)
  'neq',          -- not equals
  'gt',           -- greater than (for rating)
  'gte',          -- greater than or equal
  'lt',           -- less than
  'lte',          -- less than or equal
  'contains',     -- contains substring / multi-choice includes option
  'not_contains', -- does not contain
  'is_empty',     -- unanswered
  'is_not_empty'  -- answered
);

-- Action enum: what happens when the condition is met
CREATE TYPE logic_action AS ENUM (
  'show',  -- show target question (default hidden, shown when condition met)
  'hide',  -- hide target question (default shown, hidden when condition met)
  'skip'   -- jump to target question (skip intermediate questions)
);

CREATE TABLE IF NOT EXISTS survey_logic_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id           UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  trigger_question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  condition           logic_condition NOT NULL,
  value               TEXT,                  -- comparison value (text, option ID JSON array, number string)
  action              logic_action NOT NULL DEFAULT 'show',
  target_question_id  UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS survey_logic_rules_survey_idx ON survey_logic_rules(survey_id);
CREATE INDEX IF NOT EXISTS survey_logic_rules_trigger_idx ON survey_logic_rules(trigger_question_id);
CREATE INDEX IF NOT EXISTS survey_logic_rules_target_idx ON survey_logic_rules(target_question_id);
