/**
 * Admin wallet adjustment integration tests
 *
 * 紅線驗收：
 *  1. 增加餘額：cashBalance += amount，transaction success，兩筆 journal entries 平衡
 *  2. 扣除餘額：cashBalance -= amount，transaction success，兩筆 journal entries 平衡
 *  3. 扣除超過餘額 → BadRequestException（餘額不足）
 *  4. amount = 0 → BadRequestException
 *  5. amount 為非整數 → BadRequestException
 *  6. 每筆 journal entry: debit = credit（複式記帳平衡）
 *  7. adminId 記入 approvedBy + metadata（稽核）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq, and } from 'drizzle-orm';
import { BadRequestException } from '@nestjs/common';

process.env.PII_ENCRYPTION_KEY = 'admin-wallet-test-pii-key-do-not-use';
process.env.PII_KDF_SALT = 'admin-wallet-salt';
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

describe('WalletService adminAdjustBalance (integration)', () => {
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
        'points_in','points_spend','admin_adjustment'
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

      INSERT INTO users (id, email, role, display_name) VALUES
        ('${USER_ID}',  'user@test.com',  'respondent', 'User'),
        ('${ADMIN_ID}', 'admin@test.com', 'admin',      'Admin');

      INSERT INTO wallets (user_id, cash_balance) VALUES ('${USER_ID}', 500);
    `);

    db = drizzle(client, { schema });
    const crypto = new CryptoService();
    const ecpay = new EcpayService();
    const notifications = { create: async () => undefined } as never;
    const kyc = { assertKycForWithdrawal: async () => undefined } as never;
    service = new WalletService(
      db as never,
      notifications,
      ecpay,
      crypto,
      kyc,
      mockSystemConfig as SystemConfigService,
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it('增加餘額：cashBalance 正確增加 + journal 平衡', async () => {
    await service.adminAdjustBalance({ userId: USER_ID, adminId: ADMIN_ID, amount: 200, reason: '測試補貼' });

    const [wallet] = await db.select().from(schema.wallets).where(eq(schema.wallets.userId, USER_ID));
    expect(wallet.cashBalance).toBe(700); // 500 + 200

    const [txn] = await db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, USER_ID), eq(schema.transactions.type, 'admin_adjustment')));
    expect(txn.amount).toBe(200);
    expect(txn.status).toBe('success');
    expect(txn.approvedBy).toBe(ADMIN_ID);

    const entries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.transactionId, txn.id));
    expect(entries).toHaveLength(2);
    const totalDebit = entries.reduce((s, e) => s + e.debitAmount, 0);
    const totalCredit = entries.reduce((s, e) => s + e.creditAmount, 0);
    expect(totalDebit).toBe(totalCredit); // 借貸平衡
    expect(totalDebit).toBe(200);

    const walletEntry = entries.find((e) => e.accountName === `wallet_${USER_ID}`);
    expect(walletEntry?.creditAmount).toBe(200); // 用戶帳戶貸方（增加）
    const platformEntry = entries.find((e) => e.accountName === 'platform_adjustment');
    expect(platformEntry?.debitAmount).toBe(200); // 平台成本借方
  });

  it('扣除餘額：cashBalance 正確扣除 + journal 平衡', async () => {
    // 目前餘額 700
    await service.adminAdjustBalance({ userId: USER_ID, adminId: ADMIN_ID, amount: -300, reason: '測試扣除' });

    const [wallet] = await db.select().from(schema.wallets).where(eq(schema.wallets.userId, USER_ID));
    expect(wallet.cashBalance).toBe(400); // 700 - 300

    const txns = await db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, USER_ID), eq(schema.transactions.type, 'admin_adjustment')));
    const txn = txns[txns.length - 1]; // 取最後一筆
    expect(txn.amount).toBe(300);

    const entries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.transactionId, txn.id));
    expect(entries).toHaveLength(2);
    const totalDebit = entries.reduce((s, e) => s + e.debitAmount, 0);
    const totalCredit = entries.reduce((s, e) => s + e.creditAmount, 0);
    expect(totalDebit).toBe(totalCredit);

    const walletEntry = entries.find((e) => e.accountName === `wallet_${USER_ID}`);
    expect(walletEntry?.debitAmount).toBe(300); // 用戶帳戶借方（減少）
    const platformEntry = entries.find((e) => e.accountName === 'platform_adjustment');
    expect(platformEntry?.creditAmount).toBe(300); // 平台貸方（回收）
  });

  it('扣除超過餘額 → BadRequestException', async () => {
    // 目前餘額 400
    await expect(
      service.adminAdjustBalance({ userId: USER_ID, adminId: ADMIN_ID, amount: -999, reason: '超額扣除' }),
    ).rejects.toThrow(BadRequestException);

    // 餘額應保持不變
    const [wallet] = await db.select().from(schema.wallets).where(eq(schema.wallets.userId, USER_ID));
    expect(wallet.cashBalance).toBe(400);
  });

  it('amount = 0 → BadRequestException', async () => {
    await expect(
      service.adminAdjustBalance({ userId: USER_ID, adminId: ADMIN_ID, amount: 0, reason: '零值' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('amount 非整數 → BadRequestException', async () => {
    await expect(
      service.adminAdjustBalance({ userId: USER_ID, adminId: ADMIN_ID, amount: 99.5, reason: '小數' }),
    ).rejects.toThrow(BadRequestException);
  });
});
