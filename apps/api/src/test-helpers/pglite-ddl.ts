/**
 * Canonical PGlite DDL for integration tests.
 *
 * IMPORTANT: When the Drizzle schema changes, update BOTH:
 *   1. apps/api/src/db/schema/*.ts  (Drizzle definitions)
 *   2. apps/api/src/db/database.module.ts  (PGlite dev/test bootstrap)
 *   3. THIS FILE  (shared DDL for unit/integration tests)
 *
 * Import FULL_SCHEMA_DDL in integration tests instead of inlining CREATE TABLE
 * statements, to prevent schema drift when columns are added.
 *
 * Usage:
 *   import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
 *   await client.exec(FULL_SCHEMA_DDL);
 */

export const USERS_DDL = `
  CREATE TYPE user_role AS ENUM ('surveyor','respondent','admin');
  CREATE TYPE user_status AS ENUM ('active','suspended','pending_verify');
  CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role          user_role NOT NULL,
    status        user_status NOT NULL DEFAULT 'active',
    display_name  VARCHAR(100) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

export const SURVEYS_DDL = `
  CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
  CREATE TYPE survey_type AS ENUM ('standard','mutual');
  CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
  CREATE TYPE reward_type AS ENUM ('cash','points');
  CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');

  CREATE TABLE surveys (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    surveyor_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    status            survey_status NOT NULL DEFAULT 'draft',
    type              survey_type NOT NULL DEFAULT 'standard',
    category          survey_category,
    ai_review_enabled BOOLEAN      NOT NULL DEFAULT true,
    external_url      TEXT,
    reward_type       reward_type  NOT NULL DEFAULT 'cash',
    reward_points     INTEGER      NOT NULL DEFAULT 0,
    deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
    base_reward_points  INTEGER     NOT NULL DEFAULT 0,
    audience_criteria JSONB,
    target_count      INTEGER      NOT NULL DEFAULT 100,
    completed_count   INTEGER      NOT NULL DEFAULT 0,
    expires_at        TIMESTAMPTZ,
    ai_score              INTEGER,
    ai_reject_reason      TEXT,
    question_shuffle_mode VARCHAR(16)  NOT NULL DEFAULT 'none',
    is_anonymous          BOOLEAN      NOT NULL DEFAULT true,
    scheduled_publish_at  TIMESTAMPTZ,
    auto_close_at         TIMESTAMPTZ,
    auto_close_after_n    INTEGER,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    published_at          TIMESTAMPTZ
  );

  CREATE TABLE survey_questions (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id   UUID          NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    type        question_type NOT NULL,
    title       TEXT          NOT NULL,
    description TEXT,
    sort_order  INTEGER       NOT NULL DEFAULT 0,
    is_required BOOLEAN       NOT NULL DEFAULT true,
    config      JSONB,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  CREATE TABLE question_options (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID         NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    label       VARCHAR(300) NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0
  );
`;

export const RESPONSES_DDL = `
  CREATE TYPE response_status AS ENUM ('in_progress','submitted','pending_review','rewarded','rejected');
  CREATE TYPE response_sentiment AS ENUM ('positive','neutral','negative');

  CREATE TABLE survey_responses (
    id                     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id              UUID            NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    respondent_id          UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status                 response_status NOT NULL DEFAULT 'in_progress',
    sentiment              response_sentiment,
    started_at             TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    submitted_at           TIMESTAMPTZ,
    fill_duration_seconds  INTEGER,
    anti_cheat_score       INTEGER,
    suspicious_flags       JSONB,
    quality_score          INTEGER,
    quality_breakdown      JSONB,
    behavior_log           JSONB,
    randomization_seed     TEXT,
    fingerprint_id         TEXT,
    UNIQUE (survey_id, respondent_id)
  );

  CREATE TABLE response_answers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id         UUID        NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    survey_id           UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_id         UUID        NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    text_answer         TEXT,
    selected_option_ids JSONB,
    rating_value        INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/** Respondent profiles, interest tags, and respondent-tag junction */
export const PROFILES_DDL = `
  CREATE TYPE age_range AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
  CREATE TYPE gender AS ENUM ('male','female','non_binary','prefer_not_to_say');
  CREATE TYPE occupation AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
  CREATE TYPE education AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
  CREATE TYPE industry AS ENUM ('info_tech','manufacturing','engineering_construction','healthcare','education','finance','legal','public_sector','service','food_beverage','hospitality_travel','retail_wholesale','transport_logistics','agriculture','arts_media','marketing_pr','nonprofit','freelance','student','other');
  CREATE TYPE tag_category AS ENUM ('tech','lifestyle','finance','health','entertainment','food','travel','education','society','other');

  CREATE TABLE respondent_profiles (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    age_range          age_range,
    gender             gender,
    region             VARCHAR(20),
    occupation         occupation,
    industry           industry,
    industry_other     VARCHAR(50),
    education          education,
    reputation_score   INTEGER     NOT NULL DEFAULT 60,
    completion_rate    NUMERIC(5,2) DEFAULT 100.00,
    total_completed    INTEGER     NOT NULL DEFAULT 0,
    is_onboarding_done BOOLEAN     NOT NULL DEFAULT false,
    suspended_until    TIMESTAMPTZ,
    suspended_reason   VARCHAR(200),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE interest_tags (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(50) NOT NULL UNIQUE,
    category   tag_category NOT NULL,
    sort_order INTEGER     NOT NULL DEFAULT 0
  );

  CREATE TABLE respondent_tags (
    respondent_profile_id UUID NOT NULL REFERENCES respondent_profiles(id) ON DELETE CASCADE,
    tag_id                UUID NOT NULL REFERENCES interest_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (respondent_profile_id, tag_id)
  );
`;

/** Mutual survey pairing */
export const MUTUAL_DDL = `
  CREATE TYPE mutual_pair_status AS ENUM ('waiting','matched','a_done','b_done','both_done','expired','cancelled');
  CREATE TABLE mutual_pairs (
    id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    status        mutual_pair_status NOT NULL DEFAULT 'waiting',
    a_user_id     UUID               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    a_survey_id   UUID               NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    a_response_id UUID               REFERENCES survey_responses(id) ON DELETE SET NULL,
    a_filled_at   TIMESTAMPTZ,
    b_user_id     UUID               REFERENCES users(id) ON DELETE CASCADE,
    b_survey_id   UUID               REFERENCES surveys(id) ON DELETE CASCADE,
    b_response_id UUID               REFERENCES survey_responses(id) ON DELETE SET NULL,
    b_filled_at   TIMESTAMPTZ,
    a_proof_url   TEXT,
    b_proof_url   TEXT,
    a_rating      INTEGER,
    b_rating      INTEGER,
    a_rated_at    TIMESTAMPTZ,
    b_rated_at    TIMESTAMPTZ,
    matched_at    TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX mutual_pairs_a_survey_active_unique
    ON mutual_pairs (a_survey_id)
    WHERE status IN ('waiting','matched','a_done','b_done');
`;

/** QUA-196: Skip Logic / Conditional Branching */
export const LOGIC_RULES_DDL = `
  CREATE TYPE logic_condition AS ENUM (
    'eq','neq','gt','gte','lt','lte',
    'contains','not_contains','is_empty','is_not_empty'
  );
  CREATE TYPE logic_action AS ENUM ('show','hide','skip');
  CREATE TABLE survey_logic_rules (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id           UUID            NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    trigger_question_id UUID            NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    condition           logic_condition NOT NULL,
    value               TEXT,
    action              logic_action    NOT NULL DEFAULT 'show',
    target_question_id  UUID            NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    sort_order          INTEGER         NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
  );
  CREATE INDEX survey_logic_rules_survey_idx  ON survey_logic_rules(survey_id);
  CREATE INDEX survey_logic_rules_trigger_idx ON survey_logic_rules(trigger_question_id);
  CREATE INDEX survey_logic_rules_target_idx  ON survey_logic_rules(target_question_id);
`;

/** All tables in dependency order — use this in integration tests instead of inlining DDL. */
export const FULL_SCHEMA_DDL =
  USERS_DDL + SURVEYS_DDL + RESPONSES_DDL + PROFILES_DDL + MUTUAL_DDL + LOGIC_RULES_DDL;
