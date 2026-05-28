/**
 * Phase II.8: quality-audit DB short-circuit 整合測試
 *
 * 若 response.quality_score + quality_breakdown 已存在，audit() 應直接回
 * cached breakdown，不再跑規則式評分或 LLM 呼叫。
 *
 * 這個 test 確保：
 *  1. 已 audit 過的 response → DB_HIT，回 cached
 *  2. force:true → 略過 cache，重跑（不會直接驗最終結果，因為這條 path 會走 LLM；
 *     只驗「cache 沒被信任」這件事 — 透過 spy on ZaiClient 或 antiCheat）
 *  3. cache 不完整（缺欄位）→ fall through 重跑
 *  4. 未 audit 過（quality_score=null）→ 正常跑 pipeline
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';

delete process.env.ZAI_API_KEY; // 確保不會走 LLM
process.env.PII_ENCRYPTION_KEY = 'phase-ii8-test-pii-key';
process.env.PII_KDF_SALT = 'phase-ii8-salt';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { ZaiClient } from '../ai-audit/zai.client';
import { AntiCheatService } from './anti-cheat.service';
import { QualityAuditService } from './quality-audit.service';

const RESPONSE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const RESPONDENT_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
const SURVEYOR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddd01';

describe('QualityAuditService DB short-circuit (Phase II.8)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: QualityAuditService;
  let antiCheatCallCount = 0;
  let antiCheat: AntiCheatService;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TYPE user_role     AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status   AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email        VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role         user_role NOT NULL,
        status       user_status NOT NULL DEFAULT 'active',
        display_name VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TYPE survey_type AS ENUM ('standard','mutual');
      CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
      CREATE TABLE surveys (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       VARCHAR(200) NOT NULL,
        description TEXT,
        status      survey_status NOT NULL DEFAULT 'draft',
        type        survey_type NOT NULL DEFAULT 'standard',
        category    survey_category,
        ai_review_enabled BOOLEAN NOT NULL DEFAULT true,
        external_url TEXT,
        reward_type  reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        audience_criteria JSONB,
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ,
        ai_score INTEGER,
        ai_reject_reason TEXT,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );

      CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');
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
      CREATE TABLE survey_responses (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id             UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status                response_status NOT NULL DEFAULT 'in_progress',
        started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at          TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score      INTEGER,
        suspicious_flags      JSONB,
        quality_score         INTEGER,
        quality_breakdown     JSONB,
        behavior_log          JSONB,
        UNIQUE (survey_id, respondent_id)
      );
      CREATE TABLE response_answers (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        response_id         UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_id         UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        survey_id           UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        text_answer         TEXT,
        selected_option_ids JSONB,
        rating_value        INTEGER,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE age_range   AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
      CREATE TYPE gender      AS ENUM ('male','female','non_binary','prefer_not_to_say');
      CREATE TYPE occupation  AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
      CREATE TYPE education   AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
      CREATE TYPE industry   AS ENUM ('info_tech','manufacturing','engineering_construction','healthcare','education','finance','legal','public_sector','service','food_beverage','hospitality_travel','retail_wholesale','transport_logistics','agriculture','arts_media','marketing_pr','nonprofit','freelance','student','other');
      CREATE TABLE respondent_profiles (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        age_range          age_range,
        gender             gender,
        region             VARCHAR(20),
        occupation         occupation,
        industry           industry,
        industry_other     VARCHAR(50),
        education          education,
        reputation_score   INTEGER NOT NULL DEFAULT 60,
        completion_rate    NUMERIC(5,2) DEFAULT 100.00,
        total_completed    INTEGER NOT NULL DEFAULT 0,
        is_onboarding_done BOOLEAN NOT NULL DEFAULT false,
        suspended_until    TIMESTAMPTZ,
        suspended_reason   VARCHAR(200),
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 一個已 audit 過的 response（quality_score=85, status=passed）
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR_ID}', 'bb@bb.bb', 'surveyor', 'bb'),
        ('${RESPONDENT_ID}', 'aa@aa.aa', 'respondent', 'aa');
      INSERT INTO surveys (id, surveyor_id, title, description) VALUES
        ('${SURVEY_ID}', '${SURVEYOR_ID}', '測試問卷', 'desc');
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order) VALUES
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '${SURVEY_ID}', 'text', '請說明', 1);
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at,
        fill_duration_seconds, quality_score, quality_breakdown) VALUES
        ('${RESPONSE_ID}', '${SURVEY_ID}', '${RESPONDENT_ID}', 'rewarded', NOW(),
          120, 85,
          '{"behaviorScore":80,"signalScores":{"timing":90,"attentionCheck":null,"reverseConsistency":null,"textQuality":75,"choicePattern":80},"llmScore":88,"llmReasoning":"質量不錯","llmEvidence":[],"finalScore":85,"status":"passed","flags":[]}'::jsonb);
      INSERT INTO response_answers (response_id, survey_id, question_id, text_answer) VALUES
        ('${RESPONSE_ID}', '${SURVEY_ID}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '我覺得這份問卷很好');
    `);

    db = drizzle(client, { schema });
    const zai = new ZaiClient(); // 無 key，會 throw 若被呼叫
    const crypto = new CryptoService();
    antiCheat = new AntiCheatService();

    // 用 Proxy 替代 antiCheat 計數，避免直接賦值方法在 TS class instance 上的怪行為
    const realEvaluate = antiCheat.evaluate.bind(antiCheat);
    const counted = new Proxy(antiCheat, {
      get(target, prop, receiver) {
        if (prop === 'evaluate') {
          return (...args: Parameters<typeof realEvaluate>) => {
            antiCheatCallCount++;
            return realEvaluate(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    // ctor order: (db, zai, antiCheat, cryptoSvc) — see quality-audit.service.ts:67
    service = new QualityAuditService(db as never, zai, counted, crypto);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('1. 已 audit 過的 response → DB_HIT，回 cached、antiCheat 沒被呼叫', async () => {
    antiCheatCallCount = 0;
    const result = await service.audit(RESPONSE_ID, { fillDurationSeconds: 120 });

    expect(result.finalScore).toBe(85);
    expect(result.status).toBe('passed');
    expect(result.behaviorScore).toBe(80);
    expect(antiCheatCallCount).toBe(0); // 短路成功的關鍵斷言
  });

  it('2. force:true → 略過 cache，會跑 pipeline（antiCheat 被呼叫）', async () => {
    antiCheatCallCount = 0;
    const result = await service.audit(
      RESPONSE_ID,
      { fillDurationSeconds: 120 },
      { force: true },
    );
    expect(antiCheatCallCount).toBe(1);
    expect(['passed', 'suspicious', 'rejected']).toContain(result.status);
  });

  it('3. cache 不完整（缺 finalScore）→ fall through 重跑', async () => {
    await db
      .update(schema.surveyResponses)
      .set({
        qualityBreakdown: {
          status: 'passed' as const,
          behaviorScore: 80,
          // 缺 finalScore
        } as never,
      })
      .where(eq(schema.surveyResponses.id, RESPONSE_ID));

    antiCheatCallCount = 0;
    const result = await service.audit(RESPONSE_ID, { fillDurationSeconds: 120 });
    expect(antiCheatCallCount).toBe(1);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });

  it('4. quality_score=null（未 audit）→ 正常跑 pipeline', async () => {
    const NEW_RESP = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await client.exec(`
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at, fill_duration_seconds) VALUES
        ('${NEW_RESP}', '${SURVEY_ID}', '${SURVEYOR_ID}', 'submitted', NOW(), 60);
      INSERT INTO response_answers (response_id, survey_id, question_id, text_answer) VALUES
        ('${NEW_RESP}', '${SURVEY_ID}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '不錯');
    `);
    antiCheatCallCount = 0;
    const result = await service.audit(NEW_RESP, { fillDurationSeconds: 60 });
    expect(antiCheatCallCount).toBe(1);
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
  });
});
