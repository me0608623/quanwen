/**
 * 整合測試：排程自動發布時鎖定預算（本次 bug 修復）
 * 紅線：到期草稿被發布為 published，且標準問卷呼叫 wallet.lockSurveyBudget。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { SurveySchedulerService } from './survey-scheduler.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { WalletService } from '../wallet/wallet.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const STD = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MUT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LOTTERY_WITHOUT_TERMS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('SurveySchedulerService.publishScheduledSurveys — 預算鎖定 (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let lockSpy: ReturnType<typeof vi.fn>;
  let notifySpy: ReturnType<typeof vi.fn>;
  let service: SurveySchedulerService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    lockSpy = vi.fn().mockResolvedValue(undefined);
    notifySpy = vi.fn().mockResolvedValue(undefined);
    const wallet = { lockSurveyBudget: lockSpy } as unknown as WalletService;
    service = new SurveySchedulerService(db, { create: notifySpy } as unknown as NotificationsService, wallet);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR}', 'c@e.com', 'surveyor', 'C');
      INSERT INTO surveys (id, surveyor_id, title, status, type, reward_points, target_count, scheduled_publish_at, reward_mode, lottery_prize)
        VALUES
        ('${STD}', '${SURVEYOR}', '排程標準', 'draft', 'standard', 30, 100, NOW() - INTERVAL '1 minute', 'fixed', NULL),
        ('${MUT}', '${SURVEYOR}', '排程互惠', 'draft', 'mutual', 0, 9999, NOW() - INTERVAL '1 minute', 'fixed', NULL),
        ('${LOTTERY_WITHOUT_TERMS}', '${SURVEYOR}', '缺承諾抽獎', 'draft', 'standard', 0, 100, NOW() - INTERVAL '1 minute', 'lottery', '餐券');
    `);
  });

  it('到期草稿發布，標準鎖預算、mutual 不鎖', async () => {
    await service.publishScheduledSurveys();

    const std = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, STD)))[0];
    expect(std.status).toBe('published');
    expect(lockSpy).toHaveBeenCalledWith(SURVEYOR, STD);
    // mutual 不應鎖預算
    expect(lockSpy).not.toHaveBeenCalledWith(SURVEYOR, MUT);
  });

  it('缺少履約條款同意時間的抽獎草稿不會自動發布', async () => {
    await service.publishScheduledSurveys();

    const lottery = (await db.select().from(schema.surveys).where(eq(schema.surveys.id, LOTTERY_WITHOUT_TERMS)))[0];
    expect(lottery.status).toBe('draft');
    expect(lottery.scheduledPublishAt).toBeNull();
    expect(lockSpy).not.toHaveBeenCalledWith(SURVEYOR, LOTTERY_WITHOUT_TERMS);
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ userId: SURVEYOR }));
  });
});
