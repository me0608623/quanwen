/**
 * 轉盤（完成問卷累積抽獎次數版）整合測試
 *  1. 無次數時 getStatus → canSpin=false, availableChances=0
 *  2. grantChance → availableChances 累加
 *  3. spin（有次數）→ 扣 1 次 + 寫 spin_records + 發積分
 *  4. 無次數 spin → BadRequest
 *  5. 同日可多次轉（拿到多次次數）
 *  6. SPIN_SEGMENTS 權重總和 = 100
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { BadRequestException } from '@nestjs/common';

import * as schema from '../db/schema';
import { SpinService, SPIN_SEGMENTS } from './spin.service';
import type { AppDb } from '../db';
import type { WalletService } from '../wallet/wallet.service';
import type { NotificationsService } from '../notifications/notifications.service';

const U1 = '11111111-1111-1111-1111-111111111111';

describe('SpinService (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: SpinService;
  let grantCalls: Array<{ userId: string; points: number }>;

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
      CREATE TABLE spin_chances (
        user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        available    INTEGER NOT NULL DEFAULT 0,
        earned_total INTEGER NOT NULL DEFAULT 0,
        spent_total  INTEGER NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE spin_records (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prize_key  VARCHAR(40) NOT NULL,
        points_won INTEGER NOT NULL,
        spin_date  VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX spin_records_user_idx ON spin_records(user_id);
    `);
    await client.exec(`INSERT INTO users (id, email, role, display_name) VALUES ('${U1}', 'u1@test.local', 'respondent', 'U1');`);

    db = drizzle(client, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;

    grantCalls = [];
    const wallet = {
      grantPoints: async (userId: string, points: number) => { grantCalls.push({ userId, points }); },
    } as unknown as WalletService;
    const notifications = {
      create: async () => undefined,
    } as unknown as NotificationsService;

    service = new SpinService(db as unknown as AppDb, wallet, notifications);
  });

  beforeEach(async () => {
    await client.exec(`DELETE FROM spin_records; DELETE FROM spin_chances;`);
    grantCalls = [];
  });

  it('1. 無次數 → canSpin=false, availableChances=0', async () => {
    const s = await service.getStatus(U1);
    expect(s.canSpin).toBe(false);
    expect(s.availableChances).toBe(0);
    expect(s.segments.length).toBe(SPIN_SEGMENTS.length);
    expect(s.lastSpin).toBeNull();
  });

  it('2. grantChance 累加 availableChances / earnedTotal', async () => {
    await service.grantChance(U1, 1, '完成標準填答');
    await service.grantChance(U1, 1, '完成互惠填答');
    const s = await service.getStatus(U1);
    expect(s.availableChances).toBe(2);
    expect(s.earnedTotal).toBe(2);
    expect(s.canSpin).toBe(true);
  });

  it('3. spin（有次數）→ 扣 1 次 + 寫紀錄 + 發積分', async () => {
    await service.grantChance(U1, 1);
    const res = await service.spin(U1);
    expect(SPIN_SEGMENTS.map((x) => x.key)).toContain(res.prizeKey);

    const rows = await db.select().from(schema.spinRecords).where(eq(schema.spinRecords.userId, U1));
    expect(rows.length).toBe(1);
    expect(rows[0].pointsWon).toBe(res.pointsWon);

    const after = await service.getStatus(U1);
    expect(after.availableChances).toBe(0);
    expect(after.spentTotal).toBe(1);
    expect(after.lastSpin?.prizeKey).toBe(res.prizeKey);

    if (res.pointsWon > 0) {
      expect(grantCalls.length).toBe(1);
      expect(grantCalls[0].points).toBe(res.pointsWon);
    }
  });

  it('4. 無次數 spin → BadRequest', async () => {
    await expect(service.spin(U1)).rejects.toThrow(BadRequestException);
  });

  it('5. 同日可多次轉（拿到多次次數）', async () => {
    await service.grantChance(U1, 2);
    await service.spin(U1);
    await service.spin(U1); // 第二次同日不應被擋
    await expect(service.spin(U1)).rejects.toThrow(BadRequestException); // 次數用完才擋

    const rows = await db.select().from(schema.spinRecords).where(eq(schema.spinRecords.userId, U1));
    expect(rows.length).toBe(2);
  });

  it('6. SPIN_SEGMENTS 權重總和 = 100', async () => {
    const total = SPIN_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
    expect(total).toBe(100);
  });
});
