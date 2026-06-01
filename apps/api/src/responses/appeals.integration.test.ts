/**
 * Phase AA: 申訴流程 + ReputationService 整合測試
 *
 * 涵蓋：
 *   1. createAppeal：reason 字數 / 狀態 / 重複申訴 guard
 *   2. approveAppeal：response status → rewarded、補發獎勵（透過真實 WalletService）、
 *      reputation +5 寫入 reputation_history、通知
 *   3. dismissAppeal：狀態 → dismissed、需附說明
 *   4. idempotency：approve 後再 approve / dismiss 拒絕
 *   5. 全 reputation invariant：score 始終 clamp 在 [0, 100]
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq, desc } from 'drizzle-orm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

process.env.PII_ENCRYPTION_KEY = 'phase-aa-appeals-test-pii-key';
process.env.PII_KDF_SALT = 'phase-aa-salt';
process.env.ECPAY_MERCHANT_ID = '2000132';
process.env.ECPAY_HASH_KEY = '5294y06JbISpM5x9';
process.env.ECPAY_HASH_IV = 'v77hoKGq4kWxNNIS';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { EcpayService } from '../wallet/ecpay.service';
import { WalletService } from '../wallet/wallet.service';
import { ReputationService } from './reputation.service';
import { AppealsService } from './appeals.service';

const RESPONDENT_ID = '11111111-1111-1111-1111-111111111111';
const SURVEYOR_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = '00000000-0000-0000-0000-000000000099';
const SURVEY_ID = '33333333-3333-3333-3333-333333333301';
const RESPONSE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02';

describe('AppealsService + ReputationService (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let appeals: AppealsService;
  let reputation: ReputationService;

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

      CREATE TABLE reputation_history (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delta      INTEGER NOT NULL,
        new_score  INTEGER NOT NULL,
        reason     VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       VARCHAR(200) NOT NULL,
        status      survey_status NOT NULL DEFAULT 'draft',
        reward_points INTEGER NOT NULL DEFAULT 0,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        reward_type  reward_type NOT NULL DEFAULT 'cash',
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE response_status AS ENUM ('in_progress','submitted','rewarded','rejected');
      CREATE TYPE response_sentiment AS ENUM ('positive','neutral','negative');
      CREATE TABLE survey_responses (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id            UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status               response_status NOT NULL DEFAULT 'in_progress',
        sentiment           response_sentiment,
        started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at         TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score     INTEGER,
        suspicious_flags     JSONB,
        quality_score        INTEGER,
        quality_breakdown    JSONB,
        behavior_log         JSONB,
        UNIQUE (survey_id, respondent_id)
      );

      CREATE TYPE appeal_status AS ENUM ('pending','approved','dismissed');
      CREATE TABLE response_appeals (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        response_id   UUID NOT NULL UNIQUE REFERENCES survey_responses(id) ON DELETE CASCADE,
        respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason        TEXT NOT NULL,
        status        appeal_status NOT NULL DEFAULT 'pending',
        admin_note    VARCHAR(500),
        resolved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at   TIMESTAMPTZ
      );

      CREATE TYPE transaction_type AS ENUM (
        'deposit','reward_out','reward_in','platform_fee',
        'withdraw_request','withdraw_complete','refund',
        'points_in','points_spend'
      );
      CREATE TYPE transaction_status AS ENUM (
        'pending','processing','success','failed','cancelled'
      );
      CREATE TABLE wallets (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        cash_balance   INTEGER NOT NULL DEFAULT 0 CHECK (cash_balance >= 0),
        locked_cash    INTEGER NOT NULL DEFAULT 0 CHECK (locked_cash >= 0),
        points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
        version        INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE transactions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type                transaction_type NOT NULL,
        amount              INTEGER NOT NULL CHECK (amount > 0),
        status              transaction_status NOT NULL DEFAULT 'pending',
        external_provider   VARCHAR(50),
        external_ref        VARCHAR(200),
        related_survey_id   UUID,
        related_response_id UUID,
        note                TEXT,
        metadata            JSONB,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at        TIMESTAMPTZ,
        UNIQUE (external_provider, external_ref)
      );
      CREATE TABLE journal_entries (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        account_name   VARCHAR(100) NOT NULL,
        debit_amount   INTEGER NOT NULL DEFAULT 0,
        credit_amount  INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${RESPONDENT_ID}', 'aa@aa.aa', 'respondent', '受試者 aa'),
        ('${SURVEYOR_ID}', 'bb@bb.bb', 'surveyor', '問券方 bb'),
        ('${ADMIN_ID}', 'cc@cc.cc', 'admin', '管理員 cc');

      INSERT INTO respondent_profiles (user_id, reputation_score) VALUES ('${RESPONDENT_ID}', 60);

      INSERT INTO wallets (user_id, cash_balance, points_balance) VALUES
        ('${RESPONDENT_ID}', 0, 0),
        ('${SURVEYOR_ID}', 5000, 0);

      INSERT INTO surveys (id, surveyor_id, title, status, reward_points) VALUES
        ('${SURVEY_ID}', '${SURVEYOR_ID}', '測試問卷', 'published', 80);

      -- response 一開始為 rejected（讓申訴可建）
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, started_at, submitted_at, quality_score)
      VALUES ('${RESPONSE_ID}', '${SURVEY_ID}', '${RESPONDENT_ID}', 'rejected',
        NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 25);
    `);

    db = drizzle(client, { schema });
    const notifications = { create: async () => undefined } as never;
    const qualityAudit = {} as never;
    const ecpay = new EcpayService();
    const crypto = new CryptoService();
    const kyc = { assertKycForWithdrawal: async () => undefined } as never;

    const wallet = new WalletService(db as never, notifications, ecpay, crypto, kyc);
    reputation = new ReputationService(db as never);
    appeals = new AppealsService(
      db as never,
      notifications,
      qualityAudit,
      reputation,
      wallet,
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  async function reputationOf(userId: string) {
    const [r] = await db
      .select({ s: schema.respondentProfiles.reputationScore })
      .from(schema.respondentProfiles)
      .where(eq(schema.respondentProfiles.userId, userId))
      .limit(1);
    return r?.s ?? 0;
  }

  async function lastHistory(userId: string) {
    const [r] = await db
      .select()
      .from(schema.reputationHistory)
      .where(eq(schema.reputationHistory.userId, userId))
      .orderBy(desc(schema.reputationHistory.createdAt))
      .limit(1);
    return r;
  }

  it('1. createAppeal：reason 過短拒絕', async () => {
    await expect(
      appeals.createAppeal(RESPONSE_ID, RESPONDENT_ID, '不爽'),
    ).rejects.toThrow(BadRequestException);
  });

  it('2. createAppeal：非本人填答拒絕（Forbidden）', async () => {
    await expect(
      appeals.createAppeal(RESPONSE_ID, SURVEYOR_ID, '我覺得審不公平，請重新審查'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. createAppeal：成功建立 pending appeal', async () => {
    const { appeal } = await appeals.createAppeal(
      RESPONSE_ID,
      RESPONDENT_ID,
      '我有認真填寫，請管理員重新審查',
    );
    expect(appeal?.status).toBe('pending');
    expect(appeal?.responseId).toBe(RESPONSE_ID);
  });

  it('4. createAppeal：同一筆 response 不可重複申訴（Conflict）', async () => {
    await expect(
      appeals.createAppeal(RESPONSE_ID, RESPONDENT_ID, '我再申訴一次看看好不好'),
    ).rejects.toThrow(ConflictException);
  });

  it('5. approveAppeal：補發獎勵 + reputation +5 + 寫 history', async () => {
    const repBefore = await reputationOf(RESPONDENT_ID);
    const [appeal] = await db
      .select()
      .from(schema.responseAppeals)
      .where(eq(schema.responseAppeals.responseId, RESPONSE_ID))
      .limit(1);

    await appeals.approveAppeal(appeal!.id, ADMIN_ID, '已重新檢視填答內容，確認品質達標');

    // response → rewarded
    const [resp] = await db
      .select({ status: schema.surveyResponses.status })
      .from(schema.surveyResponses)
      .where(eq(schema.surveyResponses.id, RESPONSE_ID))
      .limit(1);
    expect(resp?.status).toBe('rewarded');

    // appeal → approved
    const [updated] = await db
      .select()
      .from(schema.responseAppeals)
      .where(eq(schema.responseAppeals.id, appeal!.id))
      .limit(1);
    expect(updated?.status).toBe('approved');
    expect(updated?.resolvedBy).toBe(ADMIN_ID);
    expect(updated?.resolvedAt).toBeTruthy();

    // reputation +5
    expect(await reputationOf(RESPONDENT_ID)).toBe(repBefore + 5);
    const hist = await lastHistory(RESPONDENT_ID);
    expect(hist?.delta).toBe(5);
    expect(hist?.reason).toBe('申訴通過補償');

    // wallet 補發獎勵：reward_in transaction
    const rewards = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.relatedResponseId, RESPONSE_ID));
    const rewardIn = rewards.find((t) => t.type === 'reward_in');
    expect(rewardIn).toBeTruthy();
    expect(rewardIn?.amount).toBe(80);
    expect(rewardIn?.status).toBe('success');
  });

  it('6. approveAppeal idempotency：第二次拒絕', async () => {
    const [appeal] = await db
      .select()
      .from(schema.responseAppeals)
      .where(eq(schema.responseAppeals.responseId, RESPONSE_ID))
      .limit(1);
    await expect(
      appeals.approveAppeal(appeal!.id, ADMIN_ID, 'redo'),
    ).rejects.toThrow(BadRequestException);
  });

  it('7. dismissAppeal：需附說明 + 狀態 → dismissed', async () => {
    // 建立第二筆 rejected response（要新 survey，因 UNIQUE survey_id+respondent_id）
    const SURVEY_2 = '33333333-3333-3333-3333-333333333302';
    const RESPONSE_2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03';
    await client.exec(`
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points)
      VALUES ('${SURVEY_2}', '${SURVEYOR_ID}', '第二份問卷', 'published', 50);
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, started_at, submitted_at)
      VALUES ('${RESPONSE_2}', '${SURVEY_2}', '${RESPONDENT_ID}', 'rejected',
        NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour');
    `);
    const { appeal } = await appeals.createAppeal(
      RESPONSE_2,
      RESPONDENT_ID,
      '我有真的填，希望重審',
    );

    // 駁回需附說明
    await expect(
      appeals.dismissAppeal(appeal!.id, ADMIN_ID, '不'),
    ).rejects.toThrow(BadRequestException);

    await appeals.dismissAppeal(appeal!.id, ADMIN_ID, '經查填答時間過短，作弊嫌疑明顯');
    const [r] = await db
      .select()
      .from(schema.responseAppeals)
      .where(eq(schema.responseAppeals.id, appeal!.id))
      .limit(1);
    expect(r?.status).toBe('dismissed');
    expect(r?.adminNote ?? '').toContain('作弊嫌疑');
  });

  it('8. ReputationService：clamp 在 [0, 100]', async () => {
    // 設為 98，加 5 應該變 100
    await db
      .update(schema.respondentProfiles)
      .set({ reputationScore: 98 })
      .where(eq(schema.respondentProfiles.userId, RESPONDENT_ID));
    const newScore = await reputation.adjust(RESPONDENT_ID, 5, '滿分測試');
    expect(newScore).toBe(100);
    const hist = await lastHistory(RESPONDENT_ID);
    expect(hist?.newScore).toBe(100);
    expect(hist?.delta).toBe(2); // 實際變動 98 → 100

    // 設為 3，扣 10 應該變 0（不會負數）
    await db
      .update(schema.respondentProfiles)
      .set({ reputationScore: 3 })
      .where(eq(schema.respondentProfiles.userId, RESPONDENT_ID));
    const minScore = await reputation.adjust(RESPONDENT_ID, -10, '掉到底測試');
    expect(minScore).toBe(0);
  });

  it('9. ReputationService.adjust：delta=0 → 立即 return null', async () => {
    const r = await reputation.adjust(RESPONDENT_ID, 0, 'no-op');
    expect(r).toBeNull();
  });

  it('10. ReputationService.adjust：profile 不存在 → return null', async () => {
    const r = await reputation.adjust('99999999-9999-9999-9999-999999999999', 5, 'ghost');
    expect(r).toBeNull();
  });
});
