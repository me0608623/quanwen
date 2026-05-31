import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import type { AppDb } from '../db';
import * as schema from '../db/schema';
import { LOGIC_RULES_DDL } from '../test-helpers/pglite-ddl';
import { ResponsesService } from './responses.service';
import type { AntiCheatService } from './anti-cheat.service';
import type { WalletService } from '../wallet/wallet.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { QualityAuditService } from './quality-audit.service';
import type { ReputationService } from './reputation.service';
import type { SpinService } from '../spin/spin.service';

const RESPONDENT_ID = '11111111-1111-1111-1111-111111111111';
const SURVEYOR_ID = '22222222-2222-2222-2222-222222222222';
const SURVEY_ID = '33333333-3333-3333-3333-333333333333';
const QUESTION_ID = '44444444-4444-4444-4444-444444444444';

describe('ResponsesService.submitResponse pending_review gate', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ResponsesService;
  const issueReward = vi.fn(async () => undefined);

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TYPE user_role AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role user_role NOT NULL,
        status user_status NOT NULL DEFAULT 'active',
        display_name VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE age_range AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
      CREATE TYPE gender AS ENUM ('male','female','non_binary','prefer_not_to_say');
      CREATE TYPE occupation AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
      CREATE TYPE education AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
      CREATE TYPE industry AS ENUM ('info_tech','manufacturing','engineering_construction','healthcare','education','finance','legal','public_sector','service','food_beverage','hospitality_travel','retail_wholesale','transport_logistics','agriculture','arts_media','marketing_pr','nonprofit','freelance','student','other');
      CREATE TABLE respondent_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        age_range age_range,
        gender gender,
        region VARCHAR(20),
        occupation occupation,
        industry industry,
        industry_other VARCHAR(50),
        education education,
        reputation_score INTEGER NOT NULL DEFAULT 60,
        completion_rate NUMERIC(5,2) DEFAULT 100.00,
        total_completed INTEGER NOT NULL DEFAULT 0,
        is_onboarding_done BOOLEAN NOT NULL DEFAULT false,
        suspended_until TIMESTAMPTZ,
        suspended_reason VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');
      CREATE TYPE survey_type AS ENUM ('standard','mutual');
      CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id UUID PRIMARY KEY,
        surveyor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status survey_status NOT NULL DEFAULT 'draft',
        type survey_type NOT NULL DEFAULT 'standard',
        category survey_category,
        reward_type reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        audience_criteria JSONB,
        ai_score INTEGER,
        ai_reject_reason TEXT
      );

      CREATE TABLE survey_questions (
        id UUID PRIMARY KEY,
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        type question_type NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_required BOOLEAN NOT NULL DEFAULT true,
        config JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE response_status AS ENUM ('in_progress','submitted','pending_review','rewarded','rejected');
      CREATE TYPE response_sentiment AS ENUM ('positive','neutral','negative');
      CREATE TABLE survey_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status response_status NOT NULL DEFAULT 'in_progress',
        sentiment           response_sentiment,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score INTEGER,
        suspicious_flags JSONB,
        quality_score INTEGER,
        quality_breakdown JSONB,
        behavior_log JSONB,
        randomization_seed TEXT,
        UNIQUE (survey_id, respondent_id)
      );

      CREATE TABLE response_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        text_answer TEXT,
        selected_option_ids JSONB,
        rating_value INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.exec(LOGIC_RULES_DDL);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES
        ('${RESPONDENT_ID}', 'respondent@test.local', 'respondent', 'Respondent'),
        ('${SURVEYOR_ID}', 'surveyor@test.local', 'surveyor', 'Surveyor');

      INSERT INTO respondent_profiles (user_id) VALUES ('${RESPONDENT_ID}');

      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, completed_count, published_at)
      VALUES ('${SURVEY_ID}', '${SURVEYOR_ID}', 'Test Survey', 'published', 100, 10, 0, NOW());

      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, is_required)
      VALUES ('${QUESTION_ID}', '${SURVEY_ID}', 'text', 'Open text question', 0, true);
    `);

    db = drizzle(client, { schema });
    const antiCheat = {
      evaluate: () => ({ score: 10, flags: [] }),
    } as unknown as AntiCheatService;
    const wallet = { issueReward } as unknown as WalletService;
    const notifications = { create: async () => undefined } as unknown as NotificationsService;
    const qualityAudit = {
      audit: async () => ({
        behaviorScore: 60,
        signalScores: {
          timing: 60,
          attentionCheck: null,
          reverseConsistency: null,
          textQuality: 60,
          choicePattern: 60,
        },
        llmScore: null,
        llmReasoning: null,
        llmEvidence: [],
        finalScore: 60,
        status: 'suspicious',
        flags: [],
      }),
    } as unknown as QualityAuditService;
    const reputation = { adjust: async () => undefined } as unknown as ReputationService;
    const spin = { grantChance: async () => undefined } as unknown as SpinService;

    service = new ResponsesService(
      db as unknown as AppDb,
      antiCheat,
      wallet,
      notifications,
      qualityAudit,
      reputation,
      spin,
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  it('marks response as pending_review when openText length > 10 and does not issue reward', async () => {
    const result = await service.submitResponse(SURVEY_ID, RESPONDENT_ID, {
      answers: [
        {
          questionId: QUESTION_ID,
          textAnswer: 'this answer has more than ten chars',
        },
      ],
    });

    expect(result.flagged).toBe(true);
    expect(issueReward).not.toHaveBeenCalled();

    const rows = await db.select().from(schema.surveyResponses);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending_review');
  });
});
