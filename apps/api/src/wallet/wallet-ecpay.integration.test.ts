/**
 * Phase W: ECPay callback + WalletService 整合測試
 *
 * 採用「service-level integration」：
 *   - 真實 PGlite DB（drizzle schema）
 *   - 真實 EcpayService（HMAC + SHA256 簽章運算）
 *   - 真實 WalletService（含 idempotency 邏輯與雙複式記帳）
 *   - NotificationsService / KycService / CryptoService 用最小 stub
 *
 * 跳過 Nest TestingModule，避開 admin.module.ts 內 require() 在 vitest 環境的解析問題。
 * 等同於：HTTP 端點之前的整段業務邏輯都跑真實 code。
 *
 * 覆蓋場景：
 *  1. 合法簽章 + RtnCode=1 → success + journal 雙邊平衡 + 錢包入帳
 *  2. 重送同一筆 callback → idempotent，無重複 journal
 *  3. CheckMacValue 被竄改 → ErrorCheckMacValue，狀態不變
 *  4. RtnCode≠1（拒絕授權）→ transaction failed，無 journal
 *  5. 未知 MerchantTradeNo → silent 1|OK
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq, sum } from 'drizzle-orm';
import { createHash } from 'crypto';

process.env.ECPAY_MERCHANT_ID = '2000132';
process.env.ECPAY_HASH_KEY = '5294y06JbISpM5x9';
process.env.ECPAY_HASH_IV = 'v77hoKGq4kWxNNIS';
process.env.PII_ENCRYPTION_KEY = 'test-pii-key-quanwen-integration-test-only';

import * as schema from '../db/schema';
import { EcpayService } from './ecpay.service';
import { WalletService } from './wallet.service';
import type { SystemConfigService } from '../system-config/system-config.service';

const mockSystemConfig: Partial<SystemConfigService> = {
  getPlatformFeeRate: () => 0.10,
  getPointsValueNtd: () => 0.5,
  getMinWithdrawal: () => 300,
  getMaxDailyWithdrawal: () => 30_000,
  getMinDeposit: () => 100,
  getMaxDeposit: () => 100_000,
};

const AA_ID = '11111111-1111-1111-1111-111111111111';

function ecpayCheckMac(params: Record<string, string>): string {
  const hashKey = process.env.ECPAY_HASH_KEY!;
  const hashIV = process.env.ECPAY_HASH_IV!;
  const sorted = Object.entries(params)
    .filter(([k]) => k !== 'CheckMacValue')
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const raw = `HashKey=${hashKey}&${sorted
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}&HashIV=${hashIV}`;
  const encoded = encodeURIComponent(raw).replace(/%20/g, '+').toLowerCase();
  return createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

describe('WalletService.processEcpayCallback (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: WalletService;

  beforeAll(async () => {
    client = new PGlite();
    // 建立必要的 enum + table（精簡版，只放 wallet/transaction/journal 用到的）
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

      -- 因為 schema 的 surveys / survey_responses FK 仍會被 drizzle 引用，這邊建空表
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

    // Seed aa user + wallet
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${AA_ID}', 'aa@aa.aa', 'respondent', '受試者 aa');
      INSERT INTO wallets (user_id, cash_balance) VALUES ('${AA_ID}', 0);
    `);

    db = drizzle(client, { schema });

    const ecpay = new EcpayService();

    // Stubs for non-callback paths
    const notifications = {
      create: async () => undefined,
    } as never;
    const crypto = {
      tryDecrypt: () => null,
      encrypt: () => '',
      decrypt: () => '',
    } as never;
    const kyc = {
      isApproved: async () => false,
    } as never;

    service = new WalletService(db as never, notifications, ecpay, crypto, kyc, mockSystemConfig as SystemConfigService);
  });

  afterAll(async () => {
    await client?.close();
  });

  async function seedPendingDeposit(tradeNo: string, amount: number) {
    const [txn] = await db
      .insert(schema.transactions)
      .values({
        userId: AA_ID,
        type: 'deposit',
        amount,
        status: 'pending',
        externalProvider: 'ecpay',
        externalRef: tradeNo,
        note: `ECPay 儲值 NT$${amount}（待付款）`,
      })
      .returning();
    return txn!;
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

  async function walletBalance() {
    const [r] = await db
      .select({ cashBalance: schema.wallets.cashBalance })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, AA_ID))
      .limit(1);
    return r?.cashBalance ?? 0;
  }

  it('合法簽章 + RtnCode=1 → success + journal 平衡 + 錢包加值', async () => {
    const tradeNo = 'QWITEST00000000W001';
    const amount = 250;
    const txn = await seedPendingDeposit(tradeNo, amount);
    const before = await walletBalance();

    const body: Record<string, string> = {
      MerchantID: process.env.ECPAY_MERCHANT_ID!,
      MerchantTradeNo: tradeNo,
      RtnCode: '1',
      RtnMsg: '交易成功',
      TradeNo: '2406010101011111',
      TradeAmt: String(amount),
      PaymentDate: '2026/05/23 10:00:00',
      PaymentType: 'Credit_CreditCard',
    };
    body.CheckMacValue = ecpayCheckMac(body);

    const reply = await service.processEcpayCallback(body);
    expect(reply).toBe('1|OK');

    const [updated] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txn.id))
      .limit(1);
    expect(updated?.status).toBe('success');
    expect(updated?.completedAt).toBeTruthy();

    const j = await journalTotals(txn.id);
    expect(j.debit).toBe(amount);
    expect(j.credit).toBe(amount);

    const after = await walletBalance();
    expect(after).toBe(before + amount);
  });

  it('idempotent 重送 → 不重複入帳', async () => {
    const tradeNo = 'QWITEST00000000W002';
    const amount = 100;
    const txn = await seedPendingDeposit(tradeNo, amount);
    const before = await walletBalance();

    const body: Record<string, string> = {
      MerchantID: process.env.ECPAY_MERCHANT_ID!,
      MerchantTradeNo: tradeNo,
      RtnCode: '1',
      RtnMsg: '交易成功',
      TradeNo: '2406010101011112',
      TradeAmt: String(amount),
      PaymentDate: '2026/05/23 10:00:00',
      PaymentType: 'Credit_CreditCard',
    };
    body.CheckMacValue = ecpayCheckMac(body);

    const r1 = await service.processEcpayCallback(body);
    expect(r1).toBe('1|OK');
    const j1 = await journalTotals(txn.id);
    const mid = await walletBalance();
    expect(mid).toBe(before + amount);

    const r2 = await service.processEcpayCallback(body);
    expect(r2).toBe('1|OK');
    const j2 = await journalTotals(txn.id);
    expect(j2).toEqual(j1);

    const final = await walletBalance();
    expect(final).toBe(mid); // 不再加值
  });

  it('CheckMacValue 被竄改 → ErrorCheckMacValue 且狀態不變', async () => {
    const tradeNo = 'QWITEST00000000W003';
    const amount = 500;
    const txn = await seedPendingDeposit(tradeNo, amount);
    const before = await walletBalance();

    const body: Record<string, string> = {
      MerchantID: process.env.ECPAY_MERCHANT_ID!,
      MerchantTradeNo: tradeNo,
      RtnCode: '1',
      RtnMsg: '交易成功',
      TradeNo: '2406010101011113',
      TradeAmt: String(amount),
      PaymentDate: '2026/05/23 10:00:00',
      PaymentType: 'Credit_CreditCard',
    };
    body.CheckMacValue = 'TAMPERED' + 'F'.repeat(56);

    const reply = await service.processEcpayCallback(body);
    expect(reply).toBe('0|ErrorCheckMacValue');

    const [after] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txn.id))
      .limit(1);
    expect(after?.status).toBe('pending');

    const j = await journalTotals(txn.id);
    expect(j.debit).toBe(0);
    expect(j.credit).toBe(0);

    expect(await walletBalance()).toBe(before);
  });

  it('合法簽章但 RtnCode 拒絕 → transaction failed，無 journal', async () => {
    const tradeNo = 'QWITEST00000000W004';
    const amount = 800;
    const txn = await seedPendingDeposit(tradeNo, amount);
    const before = await walletBalance();

    const body: Record<string, string> = {
      MerchantID: process.env.ECPAY_MERCHANT_ID!,
      MerchantTradeNo: tradeNo,
      RtnCode: '10100248',
      RtnMsg: '拒絕交易',
      TradeNo: '2406010101011114',
      TradeAmt: String(amount),
      PaymentDate: '2026/05/23 10:00:00',
      PaymentType: 'Credit_CreditCard',
    };
    body.CheckMacValue = ecpayCheckMac(body);

    const reply = await service.processEcpayCallback(body);
    expect(reply).toBe('1|OK');

    const [after] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, txn.id))
      .limit(1);
    expect(after?.status).toBe('failed');

    const j = await journalTotals(txn.id);
    expect(j.debit).toBe(0);
    expect(j.credit).toBe(0);

    expect(await walletBalance()).toBe(before);
  });

  it('未知 MerchantTradeNo → silent 1|OK', async () => {
    const body: Record<string, string> = {
      MerchantID: process.env.ECPAY_MERCHANT_ID!,
      MerchantTradeNo: 'QWUNKNOWNTRADE0000XX',
      RtnCode: '1',
      RtnMsg: '交易成功',
      TradeNo: 'XXX',
      TradeAmt: '100',
      PaymentDate: '2026/05/23 10:00:00',
      PaymentType: 'Credit_CreditCard',
    };
    body.CheckMacValue = ecpayCheckMac(body);

    const reply = await service.processEcpayCallback(body);
    expect(reply).toBe('1|OK');
  });
});
