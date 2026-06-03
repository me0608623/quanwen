/**
 * Phase B+: /tasks category filter + category counts 整合測試
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';

import * as schema from '../db/schema';
import { ResponsesService } from './responses.service';
import type { AppDb } from '../db';
import type { AntiCheatService } from './anti-cheat.service';
import type { QualityAuditService } from './quality-audit.service';
import type { ReputationService } from './reputation.service';
import type { WalletService } from '../wallet/wallet.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SpinService } from '../spin/spin.service';

const U1 = '11111111-1111-1111-1111-111111111111'; // respondent
const SURVEYOR = '99999999-9999-9999-9999-999999999999';

describe('Tasks category filter (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ResponsesService;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TYPE user_role   AS ENUM ('surveyor','respondent','admin');
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

      CREATE TYPE age_range AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
      CREATE TYPE gender    AS ENUM ('male','female','non_binary','prefer_not_to_say');
      CREATE TYPE occupation AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
      CREATE TYPE education AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
      CREATE TYPE industry AS ENUM ('info_tech','manufacturing','engineering_construction','healthcare','education','finance','legal','public_sector','service','food_beverage','hospitality_travel','retail_wholesale','transport_logistics','agriculture','arts_media','marketing_pr','nonprofit','freelance','student','other');
      CREATE TABLE respondent_profiles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        age_range       age_range,
        gender          gender,
        region          VARCHAR(20),
        occupation      occupation,
        industry        industry,
        industry_other  VARCHAR(50),
        education       education,
        reputation_score INTEGER NOT NULL DEFAULT 60,
        completion_rate NUMERIC(5,2) DEFAULT 100.00,
        total_completed INTEGER NOT NULL DEFAULT 0,
        is_onboarding_done BOOLEAN NOT NULL DEFAULT false,
        suspended_until TIMESTAMPTZ,
        suspended_reason VARCHAR(200),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE tag_category AS ENUM ('tech','lifestyle','finance','health','entertainment','food','travel','education','society','other');
      CREATE TABLE interest_tags (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(50) NOT NULL UNIQUE,
        category   tag_category NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE respondent_tags (
        respondent_profile_id UUID NOT NULL REFERENCES respondent_profiles(id) ON DELETE CASCADE,
        tag_id                UUID NOT NULL REFERENCES interest_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (respondent_profile_id, tag_id)
      );

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');
      CREATE TYPE survey_type AS ENUM ('standard','mutual');
      CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(200) NOT NULL,
        description   TEXT,
        status        survey_status NOT NULL DEFAULT 'draft',
        type          survey_type NOT NULL DEFAULT 'standard',
        category      survey_category,
        reward_type   reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        reward_mode       VARCHAR(16) NOT NULL DEFAULT 'fixed',
        lottery_prize        TEXT,
        lottery_winner_count INTEGER,
        lottery_draw_mode    VARCHAR(16),
        lottery_draw_at      TIMESTAMPTZ,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        audience_criteria JSONB,
        target_count  INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        expires_at    TIMESTAMPTZ,
        ai_score      INTEGER,
        ai_reject_reason TEXT,
        cover_image_url TEXT,
        is_anonymous  BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at  TIMESTAMPTZ
      );
      CREATE TABLE survey_questions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        type        question_type NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_required BOOLEAN NOT NULL DEFAULT true,
        config      JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE question_options (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        label       VARCHAR(300) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TYPE response_status AS ENUM ('in_progress','submitted','rewarded','rejected');
      CREATE TYPE response_sentiment AS ENUM ('positive','neutral','negative');
      CREATE TABLE survey_responses (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status        response_status NOT NULL DEFAULT 'in_progress',
        sentiment           response_sentiment,
        started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at  TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score INTEGER,
        suspicious_flags JSONB,
        quality_score INTEGER,
        quality_breakdown JSONB,
        behavior_log JSONB,
        UNIQUE (survey_id, respondent_id)
      );
      CREATE TABLE response_answers (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        response_id   UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_id   UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        text_answer   TEXT,
        selected_option_ids JSONB,
        rating_value  INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${U1}',       'r@test.local', 'respondent', 'R'),
        ('${SURVEYOR}', 's@test.local', 'surveyor',   'S');
    `);

    db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;
    service = new ResponsesService(
      db as unknown as AppDb,
      {} as AntiCheatService,
      {} as WalletService,
      {} as NotificationsService,
      {} as QualityAuditService,
      {} as ReputationService,
      {} as SpinService,
    );
  });

  beforeEach(async () => {
    await client.exec(`DELETE FROM survey_responses; DELETE FROM surveys WHERE title LIKE 'TEST%';`);
  });

  async function pub(title: string, category: string | null = null, type: 'standard' | 'mutual' = 'standard') {
    if (category) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO surveys (surveyor_id, title, status, type, category, target_count, completed_count) VALUES ($1, $2, 'published', $3, $4::survey_category, 100, 0) RETURNING id::text`,
        [SURVEYOR, title, type, category],
      );
      return r.rows[0].id;
    }
    const r = await client.query<{ id: string }>(
      `INSERT INTO surveys (surveyor_id, title, status, type, target_count, completed_count) VALUES ($1, $2, 'published', $3, 100, 0) RETURNING id::text`,
      [SURVEYOR, title, type],
    );
    return r.rows[0].id;
  }

  // ─── 測試 ───────────────────────────────────────────────────────────────

  it('1. getAvailableSurveys() 預設不帶 category → 回全部 standard published', async () => {
    await pub('TEST consumer', 'consumer');
    await pub('TEST academic', 'academic');
    await pub('TEST no-cat');

    const list = await service.getAvailableSurveys(U1);
    expect(list.length).toBe(3);
  });

  it('2. getAvailableSurveys(category="academic") → 只回 academic', async () => {
    await pub('TEST consumer', 'consumer');
    await pub('TEST academic-1', 'academic');
    await pub('TEST academic-2', 'academic');

    const list = await service.getAvailableSurveys(U1, 'academic');
    expect(list.length).toBe(2);
    expect(list.every((s) => s.title.startsWith('TEST academic'))).toBe(true);
  });

  it('3. getAvailableSurveys mutual 一律排除', async () => {
    await pub('TEST standard', 'consumer', 'standard');
    await pub('TEST mutual',   'consumer', 'mutual');

    const list = await service.getAvailableSurveys(U1);
    expect(list.length).toBe(1);
    expect(list[0].title).toBe('TEST standard');
  });

  it('4. getCategoryCounts: 各分類計數', async () => {
    await pub('TEST consumer-1', 'consumer');
    await pub('TEST consumer-2', 'consumer');
    await pub('TEST academic',   'academic');
    await pub('TEST no-cat'); // 無 category 走 uncategorized
    await pub('TEST mutual',     'wellness', 'mutual'); // mutual 不算

    const counts = await service.getCategoryCounts(U1);
    expect(counts.consumer).toBe(2);
    expect(counts.academic).toBe(1);
    expect(counts.uncategorized).toBe(1);
    expect(counts.wellness).toBeUndefined();
  });

  it('5. getCategoryCounts 排除已填過的', async () => {
    const sa = await pub('TEST academic', 'academic');
    // U1 已填過 sa
    await client.query(
      `INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at) VALUES ($1, $2, 'submitted', NOW())`,
      [sa, U1],
    );

    const counts = await service.getCategoryCounts(U1);
    expect(counts.academic).toBeUndefined();
  });

  it('6. getAvailableSurveys 回傳含 deadlineTier 與 questionCount（任務卡用）', async () => {
    await pub('TEST standard', 'consumer');
    const list = await service.getAvailableSurveys(U1);
    expect(list.length).toBeGreaterThan(0);
    const s = list[0] as Record<string, unknown>;
    expect(s).toHaveProperty('deadlineTier');
    expect(s).toHaveProperty('questionCount');
    expect(typeof s.questionCount).toBe('number');
  });

  it('7. getAvailableSurveys 依獎勵高→低排序（前端 reward 排序所依賴）', async () => {
    await client.query(
      `INSERT INTO surveys (surveyor_id, title, status, type, reward_points, target_count, completed_count)
       VALUES ($1,'低獎','published','standard',10,100,0), ($1,'高獎','published','standard',90,100,0), ($1,'中獎','published','standard',50,100,0)`,
      [SURVEYOR],
    );
    const list = await service.getAvailableSurveys(U1);
    const rewards = list.map((x) => x.rewardPoints);
    const sorted = [...rewards].sort((a, b) => b - a);
    expect(rewards).toEqual(sorted);
    expect(rewards[0]).toBe(90);
  });

  it('8. rewarded 填答不會重新出現在分類或任務列表', async () => {
    const surveyId = await pub('TEST rewarded', 'consumer');
    await client.query(
      `INSERT INTO survey_responses (survey_id, respondent_id, status, submitted_at) VALUES ($1, $2, 'rewarded', NOW())`,
      [surveyId, U1],
    );

    const counts = await service.getCategoryCounts(U1);
    const list = await service.getAvailableSurveys(U1);
    expect(counts.consumer).toBeUndefined();
    expect(list.some((survey) => survey.id === surveyId)).toBe(false);
  });
});
