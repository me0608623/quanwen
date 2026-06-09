/**
 * Phase X: 提領流程 service-level 整合測試
 *
 * 涵蓋（紅線「金流不可亂」+「個資加密」+「複式記帳」）：
 *  1. requestWithdrawal：cashBalance -= amount、lockedCash += amount，
 *     transaction status=pending，PII（bankAccount/accountName）以 AES-256-GCM 加密儲存
 *  2. approveWithdrawal：lockedCash -= amount，建立 withdraw_complete txn，
 *     journal 平衡 (DR withdraw_pending / CR escrow_esun)
 *  3. rejectWithdrawal：cashBalance += amount (退回)、lockedCash -= amount，
 *     request txn → cancelled，無 journal
 *  4. 最低提領金額守門：NT$<300 → BadRequestException
 *  5. 餘額不足 → BadRequestException
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq, sum, and } from 'drizzle-orm';
import { BadRequestException } from '@nestjs/common';

process.env.PII_ENCRYPTION_KEY = 'phase-x-withdraw-test-pii-key-do-not-use-in-prod';
process.env.PII_KDF_SALT = 'phase-x-salt';
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

const USER_ID  = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_IP = '192.168.1.1';

describe('WalletService withdrawal flow (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: WalletService;
  let crypto: CryptoService;

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

    // seed user + wallet with NT$1500 cash, plus admin user for audit tracking
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${USER_ID}', 'aa@aa.aa', 'respondent', '受試者 aa');
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${ADMIN_ID}', 'admin@aa.aa', 'admin', '管理員');
      INSERT INTO wallets (user_id, cash_balance) VALUES ('${USER_ID}', 1500);
    `);

    db = drizzle(client, { schema });

    const ecpay = new EcpayService();
    crypto = new CryptoService();
    const notifications = { create: async () => undefined } as never;
    const kyc = {
      assertKycForWithdrawal: async () => undefined, // 金額 <2000 不會觸發
    } as never;

    service = new WalletService(db as never, notifications, ecpay, crypto, kyc, mockSystemConfig as SystemConfigService);
  });

  afterAll(async () => {
    await client?.close();
  });

  async function walletState() {
    const [r] = await db
      .select({ cash: schema.wallets.cashBalance, locked: schema.wallets.lockedCash })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, USER_ID))
      .limit(1);
    return { cash: r?.cash ?? 0, locked: r?.locked ?? 0 };
  }

  async function journalTotals(transactionId: string) {
    const [r] = await db
      .select({
        debit: sum(schema.journalEntries.debitAmount).mapWith(Number),
        credit: sum(schema.journalEntries.creditAmount).mapWith(Number),
      })
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.transactionId, transactionId));
    return { debit: r?.debit ?? 0, credit: r?.credit ?? 0 };
  }

  it('1. requestWithdrawal：cash 鎖入 lockedCash，PII 加密儲存', async () => {
    const bankAccount = '700-01234567890123';
    const accountName = '陳測試';
    const before = await walletState();

    const { transactionId } = await service.requestWithdrawal(USER_ID, 500, {
      bankCode: '700',
      bankAccount,
      accountName,
    });

    expect(transactionId).toBeTruthy();
    const after = await walletState();
    expect(after.cash).toBe(before.cash - 500);
    expect(after.locked).toBe(before.locked + 500);

    const [txn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, transactionId))
      .limit(1);
    expect(txn?.status).toBe('pending');
    expect(txn?.type).toBe('withdraw_request');

    // 申請階段不應立刻寫 journal（lockedCash 還在 user 名下）
    const j = await journalTotals(transactionId);
    expect(j.debit).toBe(0);
    expect(j.credit).toBe(0);

    // PII 加密驗證：metadata 內 cipher 欄位走 AES-256-GCM
    const meta = txn?.metadata as Record<string, unknown> | null;
    expect(meta).toBeTruthy();
    expect(typeof meta?.bankAccountCipher).toBe('string');
    expect((meta?.bankAccountCipher as string).startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(meta?.bankAccountCipher as string)).toBe(bankAccount);
    expect(crypto.decrypt(meta?.accountNameCipher as string)).toBe(accountName);

    // masked 欄位不可洩漏完整資料
    expect(meta?.bankAccountMasked).not.toBe(bankAccount);
    expect((meta?.bankAccountMasked as string).includes('*')).toBe(true);
  });

  it('2. approveWithdrawal：lockedCash 解鎖，建立 complete txn，journal 平衡', async () => {
    // 先 request 一筆新申請
    const { transactionId } = await service.requestWithdrawal(USER_ID, 400, {
      bankCode: '700',
      bankAccount: '700-99999999999',
      accountName: '陳審核',
    });

    const stateBefore = await walletState();
    expect(stateBefore.locked).toBeGreaterThanOrEqual(400);

    await service.approveWithdrawal(transactionId, ADMIN_ID, ADMIN_IP);

    const stateAfter = await walletState();
    expect(stateAfter.locked).toBe(stateBefore.locked - 400);
    // approve 不影響 cashBalance（cash 在 request 時已扣）
    expect(stateAfter.cash).toBe(stateBefore.cash);

    // request 單變 success，且寫入審核追蹤欄位
    const [reqTxn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, transactionId))
      .limit(1);
    expect(reqTxn?.status).toBe('success');
    expect(reqTxn?.approvedBy).toBe(ADMIN_ID);
    expect(reqTxn?.actionAt).toBeInstanceOf(Date);
    expect(reqTxn?.actionIp).toBe(ADMIN_IP);

    // 找對應 complete txn
    const completes = await db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.userId, USER_ID),
          eq(schema.transactions.type, 'withdraw_complete'),
        ),
      );
    expect(completes.length).toBeGreaterThanOrEqual(1);
    const complete = completes[completes.length - 1]!;
    expect(complete.status).toBe('success');
    expect(complete.amount).toBe(400);

    // 雙邊平衡
    const j = await journalTotals(complete.id);
    expect(j.debit).toBe(400);
    expect(j.credit).toBe(400);
  });

  it('3. rejectWithdrawal：lockedCash 退回 cashBalance，狀態 cancelled', async () => {
    const { transactionId } = await service.requestWithdrawal(USER_ID, 350, {
      bankCode: '700',
      bankAccount: '700-11111111111',
      accountName: '陳拒絕',
    });

    const stateBefore = await walletState();
    expect(stateBefore.locked).toBeGreaterThanOrEqual(350);

    await service.rejectWithdrawal(transactionId, '銀行帳戶資料有誤', ADMIN_ID, ADMIN_IP);

    const stateAfter = await walletState();
    expect(stateAfter.cash).toBe(stateBefore.cash + 350); // 退回
    expect(stateAfter.locked).toBe(stateBefore.locked - 350);

    const [reqTxn] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, transactionId))
      .limit(1);
    expect(reqTxn?.status).toBe('cancelled');
    expect(reqTxn?.note ?? '').toContain('銀行帳戶資料有誤');
    expect(reqTxn?.approvedBy).toBe(ADMIN_ID);
    expect(reqTxn?.actionAt).toBeInstanceOf(Date);
    expect(reqTxn?.actionIp).toBe(ADMIN_IP);

    // reject 不寫 journal
    const j = await journalTotals(transactionId);
    expect(j.debit).toBe(0);
    expect(j.credit).toBe(0);
  });

  it('4. 最低提領金額守門：NT$<300 拒絕', async () => {
    await expect(
      service.requestWithdrawal(USER_ID, 200, {
        bankCode: '700',
        bankAccount: '700-22222',
        accountName: '陳小額',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. 餘額不足：超過 cashBalance 拒絕', async () => {
    const state = await walletState();
    const overAmount = state.cash + 1000;
    await expect(
      service.requestWithdrawal(USER_ID, overAmount, {
        bankCode: '700',
        bankAccount: '700-33333',
        accountName: '陳超額',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. approveWithdrawal idempotency：第二次呼叫拒絕（狀態保護）', async () => {
    const { transactionId } = await service.requestWithdrawal(USER_ID, 300, {
      bankCode: '700',
      bankAccount: '700-44444',
      accountName: '陳重審',
    });
    await service.approveWithdrawal(transactionId, ADMIN_ID, ADMIN_IP);

    await expect(service.approveWithdrawal(transactionId, ADMIN_ID, ADMIN_IP)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── Issue #35 regression tests ─────────────────────────────────────────────

  it('7. 並發防護：餘額僅夠一筆時兩筆同時提現只建立一筆 withdrawal', async () => {
    // Reset wallet to exactly NT$300 so only one of two concurrent requests
    // can succeed.  Before the fix both requests could pass the outside-tx
    // balance pre-check simultaneously.
    await db
      .update(schema.wallets)
      .set({ cashBalance: 300, lockedCash: 0 })
      .where(eq(schema.wallets.userId, USER_ID));

    const results = await Promise.allSettled([
      service.requestWithdrawal(USER_ID, 300, {
        bankCode: '700',
        bankAccount: '700-concurrent-1',
        accountName: '並發A',
      }),
      service.requestWithdrawal(USER_ID, 300, {
        bankCode: '700',
        bankAccount: '700-concurrent-2',
        accountName: '並發B',
      }),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const state = await walletState();
    expect(state.cash).toBe(0);
    expect(state.locked).toBe(300);
  });

  it('8. 每日限額防護：事務內驗限額，超過上限拒絕', async () => {
    // Cancel all prior withdrawal records for this user so the daily counter
    // starts from zero (prior tests in this file created pending/success rows).
    await db
      .update(schema.transactions)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(schema.transactions.userId, USER_ID),
          eq(schema.transactions.type, 'withdraw_request'),
        ),
      );

    // Fund wallet generously so balance is not the limiting factor
    await db
      .update(schema.wallets)
      .set({ cashBalance: 90_000, lockedCash: 0 })
      .where(eq(schema.wallets.userId, USER_ID));

    // Exhaust the NT$30,000 daily limit with one request
    await service.requestWithdrawal(USER_ID, 30_000, {
      bankCode: '700',
      bankAccount: '700-daily-1',
      accountName: '每日測試A',
    });

    // Any further request — even a minimum one — must be rejected
    await expect(
      service.requestWithdrawal(USER_ID, 300, {
        bankCode: '700',
        bankAccount: '700-daily-2',
        accountName: '每日測試B',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
