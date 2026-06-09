/**
 * Phase Z: 積分商城 redeem 整合測試
 *
 * 紅線：
 *  - 積分扣除原子化（WHERE points_balance >= cost 雙保險）
 *  - 兌換 PIN 必須以 AES-256-GCM 加密儲存（reuse PII CryptoService）
 *  - 庫存 stock_qty > 0 → 兌換後 -1；stock_qty = -1 表無限不變
 *  - journal 平衡 (DR points_wallet_<user> / CR points_liability)
 *  - listMyRedemptions 只回傳本人解密後 PIN
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq, sum, and } from 'drizzle-orm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

process.env.PII_ENCRYPTION_KEY = 'phase-z-pointshop-test-pii-key';
process.env.PII_KDF_SALT = 'phase-z-salt';

import * as schema from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { PointShopService } from './point-shop.service';
import { VoucherIssuerService } from './voucher-issuer.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_711_50 = '77777777-7777-7777-7777-777777777701';
const ITEM_STOCKED = '77777777-7777-7777-7777-7777777777aa';

describe('PointShopService.redeem (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: PointShopService;
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

      CREATE TYPE shop_item_category AS ENUM (
        'voucher_711','voucher_familymart','voucher_starbucks','voucher_general','merchandise'
      );
      CREATE TYPE redemption_status AS ENUM ('issued','used','expired','cancelled');

      CREATE TABLE point_shop_items (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        category    shop_item_category NOT NULL,
        cost_points INTEGER NOT NULL,
        face_value  INTEGER NOT NULL,
        image_url   VARCHAR(500),
        stock_qty   INTEGER NOT NULL DEFAULT -1,
        active      BOOLEAN NOT NULL DEFAULT true,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE point_redemptions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id         UUID NOT NULL REFERENCES point_shop_items(id) ON DELETE RESTRICT,
        cost_points     INTEGER NOT NULL,
        face_value      INTEGER NOT NULL,
        pin_code_cipher TEXT NOT NULL,
        status          redemption_status NOT NULL DEFAULT 'issued',
        expires_at      TIMESTAMPTZ,
        used_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${USER_ID}', 'aa@aa.aa', 'respondent', '受試者 aa');
      INSERT INTO wallets (user_id, cash_balance, points_balance) VALUES ('${USER_ID}', 0, 500);

      INSERT INTO point_shop_items (id, name, description, category, cost_points, face_value, stock_qty)
      VALUES
        ('${ITEM_711_50}', '7-11 NT$50 禮券', '7-11 通用', 'voucher_711', 100, 50, -1),
        ('${ITEM_STOCKED}', '限量星巴克券', '限量', 'voucher_starbucks', 200, 140, 3);
    `);

    db = drizzle(client, { schema });
    crypto = new CryptoService();
    const notifications = { create: async () => undefined } as never;
    const voucherIssuer = new VoucherIssuerService();
    service = new PointShopService(db as never, crypto, notifications, voucherIssuer);
  });

  afterAll(async () => {
    await client?.close();
  });

  async function pointsOf(userId: string) {
    const [r] = await db
      .select({ p: schema.wallets.pointsBalance })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .limit(1);
    return r?.p ?? 0;
  }

  async function stockOf(itemId: string) {
    const [r] = await db
      .select({ s: schema.pointShopItems.stockQty })
      .from(schema.pointShopItems)
      .where(eq(schema.pointShopItems.id, itemId))
      .limit(1);
    return r?.s ?? 0;
  }

  it('1. redeem 成功：扣積分、寫 transaction、PIN 加密、journal 平衡', async () => {
    const before = await pointsOf(USER_ID);
    const { redemptionId } = await service.redeem(USER_ID, ITEM_711_50);

    expect(await pointsOf(USER_ID)).toBe(before - 100);

    const [redemption] = await db
      .select()
      .from(schema.pointRedemptions)
      .where(eq(schema.pointRedemptions.id, redemptionId))
      .limit(1);
    expect(redemption?.status).toBe('issued');
    expect(redemption?.costPoints).toBe(100);
    expect(redemption?.faceValue).toBe(50);
    expect(redemption?.pinCodeCipher.startsWith('v1:')).toBe(true);

    // PIN 解密驗格式
    const pin = crypto.decrypt(redemption!.pinCodeCipher);
    expect(pin).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);

    // transaction + journal
    const txns = await db
      .select()
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.userId, USER_ID),
        eq(schema.transactions.type, 'points_spend'),
      ));
    expect(txns.length).toBeGreaterThanOrEqual(1);
    const txn = txns[txns.length - 1]!;

    const [j] = await db
      .select({
        debit: sum(schema.journalEntries.debitAmount).mapWith(Number),
        credit: sum(schema.journalEntries.creditAmount).mapWith(Number),
      })
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.transactionId, txn.id));
    expect(j.debit).toBe(100);
    expect(j.credit).toBe(100);
  });

  it('2. 庫存有限商品：兌換後 stock -1', async () => {
    const before = await stockOf(ITEM_STOCKED);
    await service.redeem(USER_ID, ITEM_STOCKED);
    expect(await stockOf(ITEM_STOCKED)).toBe(before - 1);
  });

  it('3. 庫存無限商品：兌換後 stock 保持 -1 不變', async () => {
    const before = await stockOf(ITEM_711_50);
    expect(before).toBe(-1);
    await service.redeem(USER_ID, ITEM_711_50);
    expect(await stockOf(ITEM_711_50)).toBe(-1);
  });

  it('4. 積分不足拒絕：BadRequestException 且狀態不變', async () => {
    // 把積分壓到 50（不夠 100）
    await db.update(schema.wallets).set({ pointsBalance: 50 }).where(eq(schema.wallets.userId, USER_ID));

    const before = await pointsOf(USER_ID);
    await expect(service.redeem(USER_ID, ITEM_711_50)).rejects.toThrow(BadRequestException);
    expect(await pointsOf(USER_ID)).toBe(before);
  });

  it('5. 商品不存在 → NotFoundException', async () => {
    await expect(
      service.redeem(USER_ID, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotFoundException);
  });

  it('6. 商品售罄（stock=0）→ ConflictException', async () => {
    // 先把庫存清零
    await db
      .update(schema.pointShopItems)
      .set({ stockQty: 0 })
      .where(eq(schema.pointShopItems.id, ITEM_STOCKED));
    await db.update(schema.wallets).set({ pointsBalance: 500 }).where(eq(schema.wallets.userId, USER_ID));

    await expect(service.redeem(USER_ID, ITEM_STOCKED)).rejects.toThrow(ConflictException);
  });

  it('7. listMyRedemptions：回傳解密後 PIN，且不漏給他人', async () => {
    const myList = await service.listMyRedemptions(USER_ID);
    expect(myList.length).toBeGreaterThan(0);
    for (const r of myList) {
      expect(r.pinCode).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    }

    // 用一個不存在的 user 撈，應該空
    const others = await service.listMyRedemptions('99999999-9999-9999-9999-999999999999');
    expect(others).toHaveLength(0);
  });
});
