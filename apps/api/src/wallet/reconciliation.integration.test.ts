/**
 * Phase CC: ReconciliationService 整合測試
 *
 * 紅線「複式記帳」+「平台帳上永遠 = 0」+「對帳異常立刻可知」。
 *
 * 流程：
 *  - 建一個含 ECPay 入金 + 鎖預算 + 出獎勵 + 平台手續費 + 提領 的完整帳本
 *  - 跑 runDaily() 應該 5 項不變式全通過
 *  - 故意製造一筆借貸不平衡 → 應該捕捉到
 *  - 故意把 wallets.cash 改錯 → 應該捕捉到差額
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';

process.env.PII_ENCRYPTION_KEY = 'phase-cc-recon-test-pii-key';
process.env.PII_KDF_SALT = 'phase-cc-salt';
process.env.ECPAY_MERCHANT_ID = '2000132';
process.env.ECPAY_HASH_KEY = '5294y06JbISpM5x9';
process.env.ECPAY_HASH_IV = 'v77hoKGq4kWxNNIS';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { EcpayService } from './ecpay.service';
import { WalletService } from './wallet.service';
import { ReconciliationService } from './reconciliation.service';

const SURVEYOR_ID = '22222222-2222-2222-2222-222222222222';
const RESPONDENT_ID = '11111111-1111-1111-1111-111111111111';

describe('ReconciliationService.runDaily (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let recon: ReconciliationService;
  let wallet: WalletService;

  async function fullSchema() {
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
        reward_type  reward_type NOT NULL DEFAULT 'cash',
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  beforeAll(async () => {
    client = new PGlite();
    await fullSchema();

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${RESPONDENT_ID}', 'aa@aa.aa', 'respondent', 'aa'),
        ('${SURVEYOR_ID}', 'bb@bb.bb', 'surveyor', 'bb');
      INSERT INTO wallets (user_id, cash_balance) VALUES
        ('${RESPONDENT_ID}', 0),
        ('${SURVEYOR_ID}', 0);
      INSERT INTO surveys (id, surveyor_id, title) VALUES
        ('33333333-3333-3333-3333-333333333301', '${SURVEYOR_ID}', '測試問卷');
    `);

    db = drizzle(client, { schema });
    const notifications = { create: async () => undefined } as never;
    const ecpay = new EcpayService();
    const crypto = new CryptoService();
    const kyc = { assertKycForWithdrawal: async () => undefined } as never;

    wallet = new WalletService(db as never, notifications, ecpay, crypto, kyc);
    recon = new ReconciliationService(db as never, notifications);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('1. 完整帳本流程後跑對帳：5 不變式全通過', async () => {
    // 1) 問券方 ECPay 入金 NT$1000 — 走 mockDeposit 將進 escrow_mock，這是允許的
    // 為了測 escrow_ecpay 路徑，手動 insert 一筆 deposit + journal
    await db.insert(schema.transactions).values({
      id: '55555555-5555-5555-5555-555555555501',
      userId: SURVEYOR_ID,
      type: 'deposit',
      amount: 1000,
      status: 'success',
      externalProvider: 'ecpay',
      externalRef: 'QWRECON01',
      completedAt: new Date(),
    });
    await db.insert(schema.journalEntries).values([
      { transactionId: '55555555-5555-5555-5555-555555555501', accountName: 'escrow_ecpay', debitAmount: 1000, creditAmount: 0 },
      { transactionId: '55555555-5555-5555-5555-555555555501', accountName: `wallet_${SURVEYOR_ID}`, debitAmount: 0, creditAmount: 1000 },
    ]);
    await db.update(schema.wallets).set({ cashBalance: 1000 }).where(eq(schema.wallets.userId, SURVEYOR_ID));

    // 2) 發放獎勵：受試者 +200，平台手續費 +20
    await wallet.issueReward({
      surveyId: '33333333-3333-3333-3333-333333333301',
      responseId: 'cccccccc-cccc-cccc-cccc-cccccccccc01',
      respondentId: RESPONDENT_ID,
      surveyorId: SURVEYOR_ID,
      rewardAmount: 200,
    });

    const report = await recon.runDaily();

    expect(report.invariants.length).toBe(5);
    const fails = report.invariants.filter((i) => !i.pass);
    if (fails.length > 0) {
      // 印出 debug 資訊
      console.error('Reconciliation fails:', JSON.stringify(fails, null, 2));
      console.error('totals:', report.totals);
    }
    expect(fails).toEqual([]);
    expect(report.unbalancedTransactions).toEqual([]);

    // wallets 加總應等於 problem.surveyor 餘額 + respondent 餘額 = (1000 - 230) + 200 = 970 (fee=15%: 30)
    expect(report.totals.walletSum).toBe(970);
    expect(report.totals.platformFeeRevenue).toBe(30);
    expect(report.totals.rewardPayableOutstanding).toBe(0);
  });

  it('2. 故意製造一筆借貸不平衡 → 對帳捕捉', async () => {
    // 寫一筆不平衡的 journal entry pair
    await db.insert(schema.transactions).values({
      id: '55555555-5555-5555-5555-5555555555a1',
      userId: SURVEYOR_ID,
      type: 'refund',
      amount: 50,
      status: 'success',
      completedAt: new Date(),
    });
    await db.insert(schema.journalEntries).values([
      { transactionId: '55555555-5555-5555-5555-5555555555a1', accountName: `wallet_${SURVEYOR_ID}`, debitAmount: 50, creditAmount: 0 },
      { transactionId: '55555555-5555-5555-5555-5555555555a1', accountName: 'reward_payable', debitAmount: 0, creditAmount: 30 }, // 30 ≠ 50 → 不平衡
    ]);

    const report = await recon.runDaily();
    const txnInv = report.invariants.find((i) => i.label === '每筆 transaction 借貸平衡');
    expect(txnInv?.pass).toBe(false);
    expect(report.unbalancedTransactions.length).toBeGreaterThanOrEqual(1);
    const ub = report.unbalancedTransactions.find(
      (t) => t.id === '55555555-5555-5555-5555-5555555555a1',
    );
    expect(ub).toBeTruthy();
    expect(ub?.debit).toBe(50);
    expect(ub?.credit).toBe(30);

    // 清除這筆髒資料，後續測試不受影響
    await db
      .delete(schema.transactions)
      .where(eq(schema.transactions.id, '55555555-5555-5555-5555-5555555555a1'));
  });

  it('3. wallets.cash 被竄改 → 對帳偵測差額', async () => {
    // 先確認當前是平衡的
    const cleanReport = await recon.runDaily();
    expect(cleanReport.invariants.find((i) => i.label === 'wallets.cash 加總 = journal wallet_* 餘額')?.pass).toBe(true);

    // 取當前 surveyor 餘額，再 +500 製造差額
    const [w] = await db
      .select({ cash: schema.wallets.cashBalance })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, SURVEYOR_ID))
      .limit(1);
    const origCash = w!.cash;
    await db
      .update(schema.wallets)
      .set({ cashBalance: origCash + 500 })
      .where(eq(schema.wallets.userId, SURVEYOR_ID));

    const report = await recon.runDaily();
    const cashInv = report.invariants.find((i) => i.label === 'wallets.cash 加總 = journal wallet_* 餘額');
    expect(cashInv?.pass).toBe(false);
    expect(cashInv?.note ?? '').toContain('差額 500');

    // 回復
    await db
      .update(schema.wallets)
      .set({ cashBalance: origCash })
      .where(eq(schema.wallets.userId, SURVEYOR_ID));
  });

  it('4. report.invariants 永遠包含 5 個固定標籤', async () => {
    const report = await recon.runDaily();
    const labels = report.invariants.map((i) => i.label);
    expect(labels).toEqual([
      '每筆 transaction 借貸平衡',
      'wallets.cash 加總 = journal wallet_* 餘額',
      'wallets.locked 加總 = journal survey_escrow 餘額',
      'reward_payable 中間帳應為 0',
      '托管帳 ≈ wallets 加總 + 累計手續費（容差 0）',
    ]);
  });

  it('5. 全 5 不變式回到 pass（recover 後）', async () => {
    const report = await recon.runDaily();
    const fails = report.invariants.filter((i) => !i.pass);
    if (fails.length > 0) {
      console.error('Final state fails:', JSON.stringify(fails, null, 2));
    }
    expect(fails).toEqual([]);
  });
});
