/**
 * Phase B 後續：AdminService 對 mutual_pairs 的 listAll + forceCancel 整合測試
 *
 * 覆蓋:
 *  1. listAllMutualPairs: 全部 / 依 status filter
 *  2. listAllMutualPairs: 帶上 a/b 雙方 displayName, email, surveyTitle
 *  3. forceCancelMutualPair: status=waiting → cancelled + 雙方通知
 *  4. forceCancelMutualPair: status=both_done → no-op (已終端)
 *  5. forceCancelMutualPair: 不存在 → NotFound
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { NotFoundException } from '@nestjs/common';

import * as schema from '../db/schema';
import { AdminService } from './admin.service';
import type { AppDb } from '../db';
import type { NotificationsService } from '../notifications/notifications.service';
import type { WalletService } from '../wallet/wallet.service';
import type { SuspiciousAnalyzerService } from './suspicious-analyzer.service';
import type { QualityAuditService } from '../responses/quality-audit.service';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const ADMIN = '00000000-0000-0000-0000-000000000099';

describe('AdminService (mutual) integration', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: AdminService;
  let notifCalls: Array<Record<string, unknown>>;

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

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE survey_type AS ENUM ('standard','mutual');
      CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(200) NOT NULL,
        status        survey_status NOT NULL DEFAULT 'draft',
        type          survey_type NOT NULL DEFAULT 'standard',
        category      survey_category,
        ai_review_enabled BOOLEAN NOT NULL DEFAULT true,
        external_url  TEXT,
        reward_type   reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        target_count  INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous  BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
        anti_cheat_score INTEGER,
        UNIQUE (survey_id, respondent_id)
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

      -- 其他 admin.service.ts 用到的表（stats 不會用到所以最小集）
      CREATE TABLE transactions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        VARCHAR(50) NOT NULL,
        status      VARCHAR(50) NOT NULL,
        amount      INTEGER NOT NULL CHECK (amount > 0),
        completed_at TIMESTAMPTZ,
        approved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        action_at    TIMESTAMPTZ,
        action_ip    TEXT
      );
    `);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${U1}',    'u1@test.local',    'respondent', 'Alice'),
        ('${U2}',    'u2@test.local',    'respondent', 'Bob'),
        ('${ADMIN}', 'admin@test.local', 'admin',      'Admin');
    `);

    db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;

    notifCalls = [];
    const notifications = {
      create: async (dto: Record<string, unknown>) => {
        notifCalls.push(dto);
      },
    } as unknown as NotificationsService;

    // 其他 deps 用空的 — 我們只測 mutual 兩個方法
    const wallet = {} as WalletService;
    const suspiciousAnalyzer = {} as SuspiciousAnalyzerService;
    const qualityAudit = {} as QualityAuditService;

    service = new AdminService(db as unknown as AppDb, notifications, wallet, suspiciousAnalyzer, qualityAudit);
  });

  beforeEach(async () => {
    await client.exec(`DELETE FROM survey_responses; DELETE FROM mutual_pairs; DELETE FROM surveys WHERE title LIKE 'TEST%';`);
    notifCalls = [];
  });

  async function createSurvey(userId: string, title: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO surveys (surveyor_id, title, type, status) VALUES ($1, $2, 'mutual', 'published') RETURNING id::text`,
      [userId, title],
    );
    return r.rows[0].id;
  }

  async function createPair(opts: {
    aUserId: string;
    aSurveyId: string;
    bUserId?: string;
    bSurveyId?: string;
    status?: schema.MutualPair['status'];
  }): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO mutual_pairs (a_user_id, a_survey_id, b_user_id, b_survey_id, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
      [opts.aUserId, opts.aSurveyId, opts.bUserId ?? null, opts.bSurveyId ?? null, opts.status ?? 'waiting'],
    );
    return r.rows[0].id;
  }

  // ─── 測試 ───────────────────────────────────────────────────────────────

  it('1. listAllMutualPairs: 全部 / 帶 displayName + email + surveyTitle', async () => {
    const s1 = await createSurvey(U1, 'TEST A survey');
    const s2 = await createSurvey(U2, 'TEST B survey');
    await createPair({ aUserId: U1, aSurveyId: s1, bUserId: U2, bSurveyId: s2, status: 'matched' });

    const pairs = await service.listAllMutualPairs();
    expect(pairs.length).toBe(1);
    expect(pairs[0].a.displayName).toBe('Alice');
    expect(pairs[0].a.email).toBe('u1@test.local');
    expect(pairs[0].a.surveyTitle).toBe('TEST A survey');
    expect(pairs[0].b?.displayName).toBe('Bob');
    expect(pairs[0].b?.email).toBe('u2@test.local');
    expect(pairs[0].b?.surveyTitle).toBe('TEST B survey');
  });

  it('2. listAllMutualPairs: status filter 只回該狀態', async () => {
    const s1 = await createSurvey(U1, 'TEST W1');
    const s2 = await createSurvey(U1, 'TEST W2');
    const s3 = await createSurvey(U2, 'TEST X1');
    await createPair({ aUserId: U1, aSurveyId: s1, status: 'waiting' });
    await createPair({ aUserId: U1, aSurveyId: s2, status: 'waiting' });
    await createPair({ aUserId: U2, aSurveyId: s3, status: 'cancelled' });

    const waiting = await service.listAllMutualPairs('waiting');
    expect(waiting.length).toBe(2);
    expect(waiting.every((p) => p.status === 'waiting')).toBe(true);

    const cancelled = await service.listAllMutualPairs('cancelled');
    expect(cancelled.length).toBe(1);
  });

  it('3. listAllMutualPairs: 沒對手時 b=null', async () => {
    const s1 = await createSurvey(U1, 'TEST solo');
    await createPair({ aUserId: U1, aSurveyId: s1, status: 'waiting' });

    const pairs = await service.listAllMutualPairs();
    expect(pairs[0].b).toBeNull();
  });

  it('4. forceCancelMutualPair: matched → cancelled + 雙方通知', async () => {
    const s1 = await createSurvey(U1, 'TEST A');
    const s2 = await createSurvey(U2, 'TEST B');
    const pairId = await createPair({ aUserId: U1, aSurveyId: s1, bUserId: U2, bSurveyId: s2, status: 'matched' });

    notifCalls = [];
    await service.forceCancelMutualPair(pairId, '管理員測試取消', ADMIN);

    const after = await client.query<{ status: string }>(
      `SELECT status FROM mutual_pairs WHERE id = $1`,
      [pairId],
    );
    expect(after.rows[0].status).toBe('cancelled');

    const cancelNotifs = notifCalls.filter((c) => c.title === '互惠配對被取消 (admin)');
    expect(cancelNotifs.length).toBe(2);
    const userIds = cancelNotifs.map((c) => c.userId);
    expect(userIds).toContain(U1);
    expect(userIds).toContain(U2);
  });

  it('5. forceCancelMutualPair: both_done → no-op (不重複通知)', async () => {
    const s1 = await createSurvey(U1, 'TEST A');
    const pairId = await createPair({ aUserId: U1, aSurveyId: s1, status: 'both_done' });

    notifCalls = [];
    await service.forceCancelMutualPair(pairId, 'test', ADMIN);

    const after = await client.query<{ status: string }>(
      `SELECT status FROM mutual_pairs WHERE id = $1`,
      [pairId],
    );
    expect(after.rows[0].status).toBe('both_done');
    expect(notifCalls.length).toBe(0);
  });

  it('6. forceCancelMutualPair: 不存在 pairId → NotFound', async () => {
    await expect(
      service.forceCancelMutualPair('99999999-9999-9999-9999-999999999999', 'test', ADMIN),
    ).rejects.toThrow(NotFoundException);
  });
});
