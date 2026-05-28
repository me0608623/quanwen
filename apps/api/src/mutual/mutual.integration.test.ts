/**
 * Phase B — Mutual 互惠流程整合測試
 *
 * 覆蓋:
 *  1. matchWaitingPairs: 兩個 waiting → 配對成 matched + 通知雙方
 *  2. matchWaitingPairs: 同一人兩份問卷 → 不會配對到自己
 *  3. submitMutualResponse: A 先填 → status=a_done, 通知 B
 *  4. submitMutualResponse: 雙方都填 → status=both_done, 雙方通知
 *  5. submitMutualResponse: status=waiting 時提交 → BadRequest
 *  6. submitMutualResponse: 重複提交 → BadRequest
 *  7. submitMutualResponse: AI 退件 → pair cancelled + 對方那份重新進池
 *  8. getPairWithSurvey: matched 時回 survey (對方那份)
 *  9. getPairWithSurvey: both_done 時回 unlocked block (對方填我的答案)
 *  10. expireOverduePairs: expiresAt 過了 → status=expired
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { BadRequestException } from '@nestjs/common';

import * as schema from '../db/schema';
import { MutualService } from './mutual.service';
import type { AppDb } from '../db';
import type { NotificationsService } from '../notifications/notifications.service';
import type { QualityAuditService } from '../responses/quality-audit.service';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const U3 = '33333333-3333-3333-3333-333333333333';

describe('MutualService (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: MutualService;
  let notifications: { calls: Array<Record<string, unknown>>; reset: () => void };
  let qualityAudit: { setScore: (n: number) => void; setStatus: (s: 'passed' | 'rejected' | 'suspicious') => void };
  let repCalls: Array<{ userId: string; delta: number; reason: string }>;

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
        avatar_url    TEXT,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        password_reset_token VARCHAR(128),
        password_reset_expires_at TIMESTAMPTZ,
        email_verification_token VARCHAR(128),
        email_verification_expires_at TIMESTAMPTZ,
        role_selected_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
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
        ai_review_enabled BOOLEAN NOT NULL DEFAULT true,
        external_url  TEXT,
        reward_type   reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        audience_criteria JSONB,
        target_count  INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        expires_at    TIMESTAMPTZ,
        ai_score      INTEGER,
        ai_reject_reason TEXT,
        is_anonymous  BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at  TIMESTAMPTZ
      );

      CREATE TABLE survey_questions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        type          question_type NOT NULL,
        title         TEXT NOT NULL,
        description   TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        is_required   BOOLEAN NOT NULL DEFAULT true,
        config        JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE question_options (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id   UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        label         VARCHAR(300) NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 0
      );

      CREATE TYPE age_range AS ENUM ('under_18','18_24','25_34','35_44','45_54','55_plus');
      CREATE TYPE gender    AS ENUM ('male','female','non_binary','prefer_not_to_say');
      CREATE TYPE occupation AS ENUM ('student','employed_full_time','employed_part_time','self_employed','unemployed','retired','homemaker','other');
      CREATE TYPE education AS ENUM ('junior_high','senior_high','vocational','bachelor','master','phd','other');
      CREATE TYPE industry AS ENUM ('info_tech','manufacturing','engineering_construction','healthcare','education','finance','legal','public_sector','service','food_beverage','hospitality_travel','retail_wholesale','transport_logistics','agriculture','arts_media','marketing_pr','nonprofit','freelance','student','other');
      CREATE TABLE respondent_profiles (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        age_range     age_range,
        gender        gender,
        region        VARCHAR(20),
        occupation    occupation,
        industry      industry,
        industry_other VARCHAR(50),
        education     education,
        reputation_score INTEGER NOT NULL DEFAULT 60,
        completion_rate NUMERIC(5,2) DEFAULT 100.00,
        total_completed INTEGER NOT NULL DEFAULT 0,
        is_onboarding_done BOOLEAN NOT NULL DEFAULT false,
        suspended_until TIMESTAMPTZ,
        suspended_reason VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE response_status AS ENUM ('in_progress','submitted','rewarded','rejected');
      CREATE TABLE survey_responses (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id     UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status        response_status NOT NULL DEFAULT 'in_progress',
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

      CREATE TYPE mutual_pair_status AS ENUM ('waiting','matched','a_done','b_done','both_done','expired','cancelled');
      CREATE TABLE mutual_pairs (
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
        a_proof_url   TEXT,
        b_proof_url   TEXT,
        a_rating      INTEGER,
        b_rating      INTEGER,
        a_rated_at    TIMESTAMPTZ,
        b_rated_at    TIMESTAMPTZ,
        matched_at    TIMESTAMPTZ,
        expires_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX mutual_pairs_a_survey_active_unique
        ON mutual_pairs (a_survey_id)
        WHERE status IN ('waiting','matched','a_done','b_done');
    `);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${U1}', 'u1@test.local', 'respondent', 'User 1'),
        ('${U2}', 'u2@test.local', 'respondent', 'User 2'),
        ('${U3}', 'u3@test.local', 'respondent', 'User 3');
    `);

    db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;

    notifications = {
      calls: [],
      reset: () => { notifications.calls = []; },
    };
    const notificationsService = {
      create: async (dto: Record<string, unknown>) => {
        notifications.calls.push(dto);
      },
    } as unknown as NotificationsService;

    let currentScore = 90;
    let currentStatus: 'passed' | 'rejected' | 'suspicious' = 'passed';
    qualityAudit = {
      setScore: (n) => { currentScore = n; },
      setStatus: (s) => { currentStatus = s; },
    };
    const qualityAuditService = {
      audit: async (_responseId: string) => ({
        behaviorScore: currentScore,
        signalScores: { timing: 1, attentionCheck: null, reverseConsistency: null, textQuality: 1, choicePattern: 1 },
        llmScore: null,
        llmReasoning: null,
        llmEvidence: [],
        finalScore: currentScore,
        status: currentStatus,
        flags: [],
      }),
    } as unknown as QualityAuditService;

    // ReputationService: 我們不關心歷史記錄, 給 stub
    repCalls = [];
    const reputationService = {
      adjust: async (userId: string, delta: number, reason: string) => {
        repCalls.push({ userId, delta, reason });
        return null;
      },
    } as unknown as import('../responses/reputation.service').ReputationService;

    // PGlite drizzle 與 node-postgres drizzle 的 type 略有差異，但執行期相容
    service = new MutualService(db as unknown as AppDb, notificationsService, qualityAuditService, reputationService);
  });

  beforeEach(async () => {
    // 清掉所有 mutual_pairs / responses / profiles 並重設 mock 狀態
    await client.exec(`DELETE FROM response_answers; DELETE FROM survey_responses; DELETE FROM mutual_pairs; DELETE FROM question_options; DELETE FROM survey_questions; DELETE FROM surveys; DELETE FROM respondent_profiles;`);
    notifications.reset();
    qualityAudit.setScore(90);
    qualityAudit.setStatus('passed');
    repCalls = [];
  });

  // ─── 輔助函式 ────────────────────────────────────────────────────────────

  async function createMutualSurvey(userId: string, title: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO surveys (surveyor_id, title, status, type, target_count) VALUES ($1, $2, 'published', 'mutual', 9999) RETURNING id::text`,
      [userId, title],
    );
    const surveyId = result.rows[0].id;
    // 加一題 text 題
    await client.query(
      `INSERT INTO survey_questions (survey_id, type, title, sort_order, is_required) VALUES ($1, 'text', '請說明？', 0, true)`,
      [surveyId],
    );
    return surveyId;
  }

  async function enqueue(userId: string, surveyId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO mutual_pairs (a_user_id, a_survey_id, status) VALUES ($1, $2, 'waiting') RETURNING id::text`,
      [userId, surveyId],
    );
    return result.rows[0].id;
  }

  async function createExternalSurvey(userId: string, title: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO surveys (surveyor_id, title, status, type, external_url, target_count) VALUES ($1, $2, 'published', 'mutual', 'https://forms.gle/x', 9999) RETURNING id::text`,
      [userId, title],
    );
    return result.rows[0].id;
  }

  async function getQuestionId(surveyId: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `SELECT id::text FROM survey_questions WHERE survey_id = $1 LIMIT 1`,
      [surveyId],
    );
    return r.rows[0].id;
  }

  // ─── 測試 ───────────────────────────────────────────────────────────────

  it('1. matchWaitingPairs: 兩個不同 user 的 waiting → matched + 通知雙方', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    const p1 = await enqueue(U1, s1);
    await enqueue(U2, s2);

    await service.matchWaitingPairs();

    const pairs = await db.select().from(schema.mutualPairs);
    expect(pairs.length).toBe(1);
    expect(pairs[0].status).toBe('matched');
    expect(pairs[0].aUserId).toBe(U1);
    expect(pairs[0].bUserId).toBe(U2);
    expect(pairs[0].id).toBe(p1);
    expect(pairs[0].matchedAt).toBeTruthy();
    expect(pairs[0].expiresAt).toBeTruthy();

    const matchedNotifs = notifications.calls.filter((c) => c.title === '互惠配對成功');
    expect(matchedNotifs.length).toBe(2);
  });

  it('2. matchWaitingPairs: 同一人兩份問卷 → 不配對到自己', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 first');
    const s2 = await createMutualSurvey(U1, 'U1 second');
    await enqueue(U1, s1);
    await enqueue(U1, s2);

    await service.matchWaitingPairs();

    const pairs = await db.select().from(schema.mutualPairs);
    expect(pairs.length).toBe(2);
    expect(pairs.every((p) => p.status === 'waiting')).toBe(true);
  });

  it('3. submitMutualResponse: A 先填 → status=a_done, B 收到通知', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();

    const [pair] = await db.select().from(schema.mutualPairs);
    const q2Id = await getQuestionId(s2);

    notifications.reset();
    const result = await service.submitMutualResponse(pair.id, U1, [
      { questionId: q2Id, textAnswer: '我認為這個產品很不錯,給我很多啟發。' },
    ]);

    expect(result.pairId).toBe(pair.id);
    expect(result.responseId).toBeTruthy();

    const [updated] = await db.select().from(schema.mutualPairs).where(eq(schema.mutualPairs.id, pair.id));
    expect(updated.status).toBe('a_done');
    expect(updated.aFilledAt).toBeTruthy();
    expect(updated.aResponseId).toBe(result.responseId);

    const notif = notifications.calls.find((c) => c.title === '對方已完成互惠填答');
    expect(notif).toBeTruthy();
    expect(notif!.userId).toBe(U2);
  });

  it('4. submitMutualResponse: 雙方都填 → status=both_done + 兩邊都通知解鎖', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();

    const [pair] = await db.select().from(schema.mutualPairs);
    const q1Id = await getQuestionId(s1);
    const q2Id = await getQuestionId(s2);

    await service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: '答案 A 寫長一點不會被擋。' }]);
    notifications.reset();
    await service.submitMutualResponse(pair.id, U2, [{ questionId: q1Id, textAnswer: '答案 B 也寫長一點。' }]);

    const [final] = await db.select().from(schema.mutualPairs).where(eq(schema.mutualPairs.id, pair.id));
    expect(final.status).toBe('both_done');
    expect(final.aFilledAt).toBeTruthy();
    expect(final.bFilledAt).toBeTruthy();

    const unlockedNotifs = notifications.calls.filter((c) => c.title === '互惠問卷已解鎖');
    expect(unlockedNotifs.length).toBe(2);
  });

  it('5. submitMutualResponse: status=waiting 提交 → BadRequest', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const pairId = await enqueue(U1, s1);
    // 故意不 match
    const qId = await getQuestionId(s1);
    await expect(
      service.submitMutualResponse(pairId, U1, [{ questionId: qId, textAnswer: 'x' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. submitMutualResponse: 重複提交 → BadRequest', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    const q2Id = await getQuestionId(s2);
    await service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: '答案 1 寫長一點。' }]);
    await expect(
      service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: '答案 2 再次提交。' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('7. submitMutualResponse: AI 退件 → pair cancelled + 對方重新進池', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    const q2Id = await getQuestionId(s2);

    qualityAudit.setStatus('rejected');
    qualityAudit.setScore(20);

    await expect(
      service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: 'aaaaaa' }]),
    ).rejects.toThrow(BadRequestException);

    const allPairs = await db.select().from(schema.mutualPairs);
    const original = allPairs.find((p) => p.id === pair.id);
    expect(original?.status).toBe('cancelled');

    // 對方 (U2) 那份 survey 應被重新放回 waiting (新 row)
    const reinserted = allPairs.find((p) => p.aUserId === U2 && p.aSurveyId === s2 && p.status === 'waiting');
    expect(reinserted).toBeTruthy();

    // 通知雙方
    const cancelNotif = notifications.calls.find((c) => c.title === '互惠配對已取消（AI 退件）');
    expect(cancelNotif).toBeTruthy();
    expect(cancelNotif!.userId).toBe(U1);
  });

  it('8. getPairWithSurvey: matched 時回對方那份 survey', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 my survey');
    const s2 = await createMutualSurvey(U2, 'U2 their survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);

    const detail = await service.getPairWithSurvey(pair.id, U1);
    expect(detail.survey?.id).toBe(s2);
    expect(detail.survey?.title).toBe('U2 their survey');
    expect(detail.unlocked).toBeNull();
  });

  it('9. getPairWithSurvey: both_done 時回 unlocked block', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 my survey');
    const s2 = await createMutualSurvey(U2, 'U2 their survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    const q1Id = await getQuestionId(s1);
    const q2Id = await getQuestionId(s2);

    await service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: '我寫了一段比較長的內容讓 AI 判斷有意義。' }]);
    await service.submitMutualResponse(pair.id, U2, [{ questionId: q1Id, textAnswer: 'B 也寫了一段比較長的內容讓 AI 判斷有意義。' }]);

    // U1 視角應看到 U2 對 U1 的問卷的填答
    const detail = await service.getPairWithSurvey(pair.id, U1);
    expect(detail.unlocked).not.toBeNull();
    expect(detail.unlocked!.mySurveyTitle).toBe('U1 my survey');
    expect(detail.unlocked!.questions.length).toBe(1);
    expect(detail.unlocked!.questions[0].answer?.textAnswer).toContain('比較長');
  });

  it('12. reEnqueueSurvey: cancelled 後可重新進池 (新 row, status=waiting)', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    const q2Id = await getQuestionId(s2);

    qualityAudit.setStatus('rejected');
    qualityAudit.setScore(10);
    await expect(
      service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: 'gg' }]),
    ).rejects.toThrow(BadRequestException);

    // U1 (cheater) 重新把 s1 放回池
    qualityAudit.setStatus('passed');
    const result = await service.reEnqueueSurvey(U1, s1);
    expect(result.pairId).toBeTruthy();

    const all = await db.select().from(schema.mutualPairs);
    const requeued = all.find((p) => p.id === result.pairId);
    expect(requeued?.status).toBe('waiting');
    expect(requeued?.aUserId).toBe(U1);
    expect(requeued?.aSurveyId).toBe(s1);
  });

  it('13. reEnqueueSurvey: 已在 active 池中 → BadRequest', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    await enqueue(U1, s1);

    await expect(service.reEnqueueSurvey(U1, s1)).rejects.toThrow(BadRequestException);
  });

  it('14. reEnqueueSurvey: 非自己問卷 → Forbidden', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    // U2 想重 enqueue U1 的問卷
    await expect(service.reEnqueueSurvey(U2, s1)).rejects.toThrow(/無權/);
  });

  it('C3-1. submitProof: 雙方上傳截圖 → both_done', async () => {
    const s1 = await createExternalSurvey(U1, 'EXT 1');
    const s2 = await createExternalSurvey(U2, 'EXT 2');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);

    const r1 = await service.submitProof(pair.id, U1, 'https://img/1.png');
    expect(r1.status).toBe('a_done');
    const r2 = await service.submitProof(pair.id, U2, 'https://img/2.png');
    expect(r2.status).toBe('both_done');

    const [updated] = await db.select().from(schema.mutualPairs).where(eq(schema.mutualPairs.id, pair.id));
    expect(updated.aProofUrl).toBe('https://img/1.png');
    expect(updated.bProofUrl).toBe('https://img/2.png');
  });

  it('C3-2. rateOther: 5 星 → 對方 +2, 2 星 → 對方 -3', async () => {
    const s1 = await createExternalSurvey(U1, 'EXT 1');
    const s2 = await createExternalSurvey(U2, 'EXT 2');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    await service.submitProof(pair.id, U1, 'https://img/1.png');
    await service.submitProof(pair.id, U2, 'https://img/2.png');

    repCalls = [];
    await service.rateOther(pair.id, U1, 5); // A 給 B 5 星 → B +2
    await service.rateOther(pair.id, U2, 2); // B 給 A 2 星 → A -3

    const bPlus = repCalls.find((c) => c.userId === pair.bUserId && c.delta === 2);
    const aMinus = repCalls.find((c) => c.userId === pair.aUserId && c.delta === -3);
    expect(bPlus).toBeTruthy();
    expect(aMinus).toBeTruthy();
  });

  it('C3-3. rateOther: 未 both_done 不能評', async () => {
    const s1 = await createExternalSurvey(U1, 'EXT 1');
    const s2 = await createExternalSurvey(U2, 'EXT 2');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    // 只有 A 上傳 → 還沒 both_done
    await service.submitProof(pair.id, U1, 'https://img/1.png');
    await expect(service.rateOther(pair.id, U1, 5)).rejects.toThrow(/都完成/);
  });

  it('C3-4. rateOther: 不能重複評分', async () => {
    const s1 = await createExternalSurvey(U1, 'EXT 1');
    const s2 = await createExternalSurvey(U2, 'EXT 2');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    await service.submitProof(pair.id, U1, 'https://img/1.png');
    await service.submitProof(pair.id, U2, 'https://img/2.png');
    await service.rateOther(pair.id, U1, 4);
    await expect(service.rateOther(pair.id, U1, 5)).rejects.toThrow(/已經評過/);
  });

  it('18. getMyStats: total / byStatus / successRate', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 a');
    const s2 = await createMutualSurvey(U2, 'U2 a');
    const s3 = await createMutualSurvey(U3, 'U3 a');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await enqueue(U3, s3);
    await service.matchWaitingPairs();

    // U1 配對到 U2 (依 FIFO), 變成 matched. U3 留 waiting.
    // 再強制 mark one pair as both_done 一個 cancelled
    await client.query(`UPDATE mutual_pairs SET status='both_done' WHERE a_user_id=$1 AND status='matched'`, [U1]);
    // U3 還 waiting (沒對手)
    // 模擬一個 cancelled
    await client.query(`INSERT INTO mutual_pairs (a_user_id, a_survey_id, status) VALUES ($1, $2, 'cancelled')`, [
      U1, await createMutualSurvey(U1, 'U1 b'),
    ]);

    const stats = await service.getMyStats(U1);
    expect(stats.total).toBe(2);
    expect(stats.byStatus.both_done).toBe(1);
    expect(stats.byStatus.cancelled).toBe(1);
    expect(stats.successRate).toBe(50); // 1 both_done / (1+1 terminal) = 50%
  });

  it('19. getPoolStats: count waiting accurate', async () => {
    const s1 = await createMutualSurvey(U1, 'U1');
    const s2 = await createMutualSurvey(U2, 'U2');
    await enqueue(U1, s1);
    await enqueue(U2, s2);

    const stats = await service.getPoolStats(U1);
    expect(stats.waiting).toBe(2);
    expect(stats.myWaiting).toBe(1);
  });

  it('20. reEnqueueSurvey: 非 mutual 問卷 → BadRequest', async () => {
    const r = await client.query<{ id: string }>(
      `INSERT INTO surveys (surveyor_id, title, status, type) VALUES ($1, $2, 'published', 'standard') RETURNING id::text`,
      [U1, 'TEST standard'],
    );
    const sid = r.rows[0].id;
    await expect(service.reEnqueueSurvey(U1, sid)).rejects.toThrow(/僅互惠/);
  });

  // Note: PII filter 是在 SurveysService.publish() 跑的,所以這支測試會在
  //       對應 surveys integration test 補。這邊只測 service 層其他互惠邏輯。

  it('17. listMyPairs 帶上對方 reputation score', async () => {
    // 建 U1 + U2 的 respondent_profile (帶 reputation)
    await client.query(`INSERT INTO respondent_profiles (user_id, reputation_score) VALUES ($1, 75) ON CONFLICT (user_id) DO UPDATE SET reputation_score = 75`, [U1]);
    await client.query(`INSERT INTO respondent_profiles (user_id, reputation_score) VALUES ($1, 88) ON CONFLICT (user_id) DO UPDATE SET reputation_score = 88`, [U2]);
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();

    // U1 視角: other = U2 → reputation 88
    const u1View = await service.listMyPairs(U1);
    expect(u1View.length).toBe(1);
    expect(u1View[0].self.reputationScore).toBe(75);
    expect(u1View[0].other?.reputationScore).toBe(88);

    // U2 視角: other = U1 → reputation 75
    const u2View = await service.listMyPairs(U2);
    expect(u2View[0].other?.reputationScore).toBe(75);
  });

  it('16. matchWaitingPairs: 優先配對同 category', async () => {
    const sAcad1 = await createMutualSurvey(U1, 'U1 academic');
    const sCons1 = await createMutualSurvey(U2, 'U2 consumer');
    const sAcad2 = await createMutualSurvey(U3, 'U3 academic');
    await client.query(`UPDATE surveys SET category = 'academic' WHERE id IN ($1, $2)`, [sAcad1, sAcad2]);
    await client.query(`UPDATE surveys SET category = 'consumer' WHERE id = $1`, [sCons1]);
    await enqueue(U1, sAcad1);
    await enqueue(U2, sCons1);
    await enqueue(U3, sAcad2);

    await service.matchWaitingPairs();

    const pairs = await db.select().from(schema.mutualPairs);
    // U1 (academic) 應跟 U3 (academic) 配對, U2 (consumer) 留 waiting
    const matched = pairs.find((p) => p.status === 'matched');
    const waiting = pairs.find((p) => p.status === 'waiting');
    expect(matched).toBeTruthy();
    expect(waiting).toBeTruthy();
    expect(waiting?.aUserId).toBe(U2);
    const matchedUserIds = [matched!.aUserId, matched!.bUserId];
    expect(matchedUserIds).toContain(U1);
    expect(matchedUserIds).toContain(U3);
  });

  it('15. submitMutualResponse: 被停權者不能填', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    const q2Id = await getQuestionId(s2);

    // 把 U1 停權 7 天
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO respondent_profiles (user_id, suspended_until, suspended_reason) VALUES ($1, $2, '連續退件停權') ON CONFLICT (user_id) DO UPDATE SET suspended_until = EXCLUDED.suspended_until, suspended_reason = EXCLUDED.suspended_reason`,
      [U1, future.toISOString()],
    );

    await expect(
      service.submitMutualResponse(pair.id, U1, [{ questionId: q2Id, textAnswer: '一段很長的有意義填答內容' }]),
    ).rejects.toThrow(/停權|暫停/);
  });

  it('11. AI 退件 cheater=B → A 的 survey 也能成功重新進池 (partial unique 修)', async () => {
    const s1 = await createMutualSurvey(U1, 'U1 survey');
    const s2 = await createMutualSurvey(U2, 'U2 survey');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();
    const [pair] = await db.select().from(schema.mutualPairs);
    const q1Id = await getQuestionId(s1);

    qualityAudit.setStatus('rejected');
    qualityAudit.setScore(15);

    // 由 B (U2) 提交垃圾填答, 預期 cancel + 把 A 的 s1 重新放回池
    await expect(
      service.submitMutualResponse(pair.id, U2, [{ questionId: q1Id, textAnswer: 'gg' }]),
    ).rejects.toThrow(BadRequestException);

    const all = await db.select().from(schema.mutualPairs);
    const cancelled = all.find((p) => p.id === pair.id);
    expect(cancelled?.status).toBe('cancelled');

    const reinserted = all.find((p) => p.aSurveyId === s1 && p.status === 'waiting');
    expect(reinserted).toBeTruthy();
    expect(reinserted?.aUserId).toBe(U1);
  });

  it('10. expireOverduePairs: expiresAt 過 → status=expired', async () => {
    const s1 = await createMutualSurvey(U1, 'U1');
    const s2 = await createMutualSurvey(U2, 'U2');
    await enqueue(U1, s1);
    await enqueue(U2, s2);
    await service.matchWaitingPairs();

    // 把 expiresAt 拉到過去
    const past = new Date(Date.now() - 60_000);
    await client.query(`UPDATE mutual_pairs SET expires_at = $1 WHERE status = 'matched'`, [past.toISOString()]);

    notifications.reset();
    await service.expireOverduePairs();

    const [pair] = await db.select().from(schema.mutualPairs);
    expect(pair.status).toBe('expired');

    const expiredNotifs = notifications.calls.filter((c) => c.title === '互惠配對超時');
    expect(expiredNotifs.length).toBe(2);
  });
});
