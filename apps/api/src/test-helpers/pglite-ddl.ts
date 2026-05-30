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
    ai_score          INTEGER,
    ai_reject_reason  TEXT,
    is_anonymous      BOOLEAN      NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    published_at      TIMESTAMPTZ
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
    UNIQUE (survey_id, respondent_id)
  );

  CREATE TABLE response_answers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id         UUID        NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    survey_id           UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_id         UUID        NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    text_answer         TEXT,
    selected_option_ids UUID[],
    rating_value        INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/** Convenience: all core tables in creation order */
export const FULL_SCHEMA_DDL = USERS_DDL + SURVEYS_DDL + RESPONSES_DDL;
