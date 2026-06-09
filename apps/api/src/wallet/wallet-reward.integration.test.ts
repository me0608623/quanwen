/**
 * Phase Y: issueReward + 全系統 journal invariant 整合測試
 *
 * 流程：填答提交 → 平台呼叫 walletService.issueReward → 三筆 transaction（reward_out/in/fee）
 *      + 6 筆 journal entries（雙複式記帳）。
 *
 * 紅線守則：
 *   - 問券方餘額不足時：txStatus = pending，受試者錢包**不入帳**，但 journal 仍寫入（標記負債）
 *   - 餘額足時：受試者錢包 += rewardAmount，問券方 wallet -= (reward + fee)，平台收益 += fee
 *   - 全系統 journal：sum(debit_amount) === sum(credit_amount) 永遠成立
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq, sum } from 'drizzle-orm';

process.env.PII_ENCRYPTION_KEY = 'phase-y-reward-test-pii-key';
process.env.PII_KDF_SALT = 'phase-y-salt';
process.env.ECPAY_MERCHANT_ID = '2000132';
process.env.ECPAY_HASH_KEY = '5294y06JbISpM5x9';
process.env.ECPAY_HASH_IV = 'v77hoKGq4kWxNNIS';

import * as schema from '../db/schema';
import { EcpayService } from './ecpay.service';
import { WalletService } from './wallet.service';
import { CryptoService } from '../common/crypto.service';
import type { SystemConfigService } from '../system-config/system-config.service';

const mockSystemConfig: Partial<SystemConfigService> = {
  getPlatformFeeRate: () => 0.10,
  getPointsValueNtd: () => 0.5,
  getMinWithdrawal: () => 300,
  getMaxDailyWithdrawal: () => 30_000,
  getMinDeposit: () => 100,
  getMaxDeposit: () => 100_000,
};

const SURVEYOR_ID = '22222222-2222-2222-2222-222222222222';
const RESPONDENT_ID = '11111111-1111-1111-1111-111111111111';
const SURVEY_ID = '33333333-3333-3333-3333-333333333301';

describe('WalletService.issueReward (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: WalletService;

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
        approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
        action_at           TIMESTAMPTZ,
        action_ip           TEXT,
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
    `);

    // 問券方 NT$1000 / 受試者 NT$0；後續測試會調整餘額
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES
        ('${RESPONDENT_ID}', 'aa@aa.aa', 'respondent', '受試者 aa'),
        ('${SURVEYOR_ID}', 'bb@bb.bb', 'surveyor', '問券方 bb');
      INSERT INTO wallets (user_id, cash_balance) VALUES
        ('${RESPONDENT_ID}', 0),
        ('${SURVEYOR_ID}', 1000);
      INSERT INTO surveys (id, surveyor_id, title) VALUES
        ('${SURVEY_ID}', '${SURVEYOR_ID}', '測試問卷');
    `);

    db = drizzle(client, { schema });
    const ecpay = new EcpayService();
    const crypto = new CryptoService();
    const notifications = { create: async () => undefined } as never;
    const kyc = { assertKycForWithdrawal: async () => undefined } as never;

    service = new WalletService(db as never, notifications, ecpay, crypto, kyc, mockSystemConfig as SystemConfigService);
  });

  afterAll(async () => {
    await client?.close();
  });

  async function cashOf(userId: string) {
    const [r] = await db
      .select({ cash: schema.wallets.cashBalance })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .limit(1);
    return r?.cash ?? 0;
  }

  async function pointsOf(userId: string) {
    const [r] = await db
      .select({ points: schema.wallets.pointsBalance })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .limit(1);
    return r?.points ?? 0;
  }

  async function txnsByResponse(responseId: string) {
    return db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.relatedResponseId, responseId));
  }

  async function totalJournalBalance() {
    const [r] = await db
      .select({
        debit: sum(schema.journalEntries.debitAmount).mapWith(Number),
        credit: sum(schema.journalEntries.creditAmount).mapWith(Number),
      })
      .from(schema.journalEntries);
    return { debit: r?.debit ?? 0, credit: r?.credit ?? 0 };
  }

  it('1. 餘額足：surveyor wallet -=110, respondent +=100, fee=10, journal 全平衡', async () => {
    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc01';
    const surveyorBefore = await cashOf(SURVEYOR_ID);
    const respondentBefore = await cashOf(RESPONDENT_ID);

    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: 100,
    });

    const surveyorAfter = await cashOf(SURVEYOR_ID);
    const respondentAfter = await cashOf(RESPONDENT_ID);
    expect(surveyorAfter).toBe(surveyorBefore - 110); // 100 + 10 fee
    expect(respondentAfter).toBe(respondentBefore + 100);

    const txns = await txnsByResponse(responseId);
    expect(txns).toHaveLength(3);
    const types = new Set(txns.map((t) => t.type));
    expect(types).toEqual(new Set(['reward_out', 'reward_in', 'platform_fee']));
    expect(txns.every((t) => t.status === 'success')).toBe(true);

    const balance = await totalJournalBalance();
    expect(balance.debit).toBe(balance.credit);
  });

  it('2. 餘額不足：txStatus=pending，受試者錢包不入帳，wallet 不扣款', async () => {
    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc02';
    const surveyorBefore = await cashOf(SURVEYOR_ID);
    const respondentBefore = await cashOf(RESPONDENT_ID);

    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: surveyorBefore + 100, // 一定超出問券方餘額
    });

    const surveyorAfter = await cashOf(SURVEYOR_ID);
    const respondentAfter = await cashOf(RESPONDENT_ID);
    expect(surveyorAfter).toBe(surveyorBefore); // 不扣
    expect(respondentAfter).toBe(respondentBefore); // 不入帳

    const txns = await txnsByResponse(responseId);
    expect(txns).toHaveLength(3);
    expect(txns.every((t) => t.status === 'pending')).toBe(true);

    // pending 仍會寫 journal（記錄潛在負債），總平衡仍成立
    const balance = await totalJournalBalance();
    expect(balance.debit).toBe(balance.credit);
  });

  it('3. rewardAmount = 0 → no-op，無 transaction 寫入', async () => {
    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc03';

    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: 0,
    });

    const txns = await txnsByResponse(responseId);
    expect(txns).toHaveLength(0);
  });

  it('4. 全系統 journal invariant：跨所有測試 sum(debit) === sum(credit)', async () => {
    // 再額外觸發一筆獎勵
    await db
      .update(schema.wallets)
      .set({ cashBalance: 5000 })
      .where(eq(schema.wallets.userId, SURVEYOR_ID));

    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc04';
    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: 250,
    });

    const balance = await totalJournalBalance();
    expect(balance.debit).toBeGreaterThan(0);
    expect(balance.debit).toBe(balance.credit);

    // 進一步驗：每個 transaction 自身 debit/credit 也平衡
    const allTxns = await db.select({ id: schema.transactions.id }).from(schema.transactions);
    for (const t of allTxns) {
      const [r] = await db
        .select({
          debit: sum(schema.journalEntries.debitAmount).mapWith(Number),
          credit: sum(schema.journalEntries.creditAmount).mapWith(Number),
        })
        .from(schema.journalEntries)
        .where(eq(schema.journalEntries.transactionId, t.id));
      const d = r?.debit ?? 0;
      const c = r?.credit ?? 0;
      expect(d, `txn ${t.id} debit/credit imbalance`).toBe(c);
    }
  });

  it('5. 平台手續費分錄走 platform_revenue，問券方 wallet 完整扣 reward+fee', async () => {
    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc05';
    const reward = 200;

    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: reward,
    });

    const txns = await txnsByResponse(responseId);
    const feeTxn = txns.find((t) => t.type === 'platform_fee');
    expect(feeTxn).toBeTruthy();
    expect(feeTxn!.amount).toBe(20); // 10% of 200

    const entries = await db
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.transactionId, feeTxn!.id));
    const platformRev = entries.find((e) => e.accountName === 'platform_revenue');
    expect(platformRev?.creditAmount).toBe(20);
  });

  it('6. 同一份填答重試發獎時不重複扣款或入帳', async () => {
    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc06';
    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: 120,
    });
    const surveyorAfterFirst = await cashOf(SURVEYOR_ID);
    const respondentAfterFirst = await cashOf(RESPONDENT_ID);

    await service.issueReward({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: 120,
    });

    expect(await cashOf(SURVEYOR_ID)).toBe(surveyorAfterFirst);
    expect(await cashOf(RESPONDENT_ID)).toBe(respondentAfterFirst);
    expect(await txnsByResponse(responseId)).toHaveLength(3);
  });

  it('7. 同一份填答重試發積分時不重複入帳', async () => {
    const responseId = 'cccccccc-cccc-cccc-cccc-cccccccccc07';
    const before = await pointsOf(RESPONDENT_ID);
    await service.issuePoints({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      pointsAmount: 75,
    });
    await service.issuePoints({
      surveyId: SURVEY_ID,
      responseId,
      respondentId: RESPONDENT_ID,
      pointsAmount: 75,
    });

    expect(await pointsOf(RESPONDENT_ID)).toBe(before + 75);
    expect(await txnsByResponse(responseId)).toHaveLength(1);
  });
});
