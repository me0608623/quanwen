/**
 * 整合測試：SurveysService.update() 的加急倍率與排程欄位映射（本次新增）
 * 紅線：update 時 deadlineTier 套 applyRushMultiplier、baseRewardPoints 記錄、排程欄位持久化。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { SurveysService } from './surveys.service';
import type { ZaiClient } from '../ai-audit/zai.client';
import type { AiAuditService } from '../ai-audit/ai-audit.service';
import type { WalletService } from '../wallet/wallet.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('SurveysService.update — 加急倍率 + 排程映射 (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, base_reward_points, deadline_tier, target_count)
        VALUES ('${SID}', '${SURVEYOR}', '草稿問卷', 'draft', 0, 0, 'standard', 100);
    `);
  });

  it('deadlineTier=urgent → rewardPoints 套 1.5x、base 記錄、排程持久化', async () => {
    await service.update(SID, SURVEYOR, {
      rewardPoints: 50,
      targetCount: 200,
      deadlineTier: 'urgent',
      scheduledPublishAt: '2026-07-15T01:30:00.000Z',
      autoCloseAfterN: 300,
    } as never);

    const rows = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SID));
    const s = rows[0];
    expect(s.baseRewardPoints).toBe(50);
    expect(s.rewardPoints).toBe(75); // 50 × 1.5
    expect(s.deadlineTier).toBe('urgent');
    expect(s.targetCount).toBe(200);
    expect(s.scheduledPublishAt).toBeTruthy();
    expect(s.autoCloseAfterN).toBe(300);
  });

  it('清空排程：傳 null 應寫回 null', async () => {
    await service.update(SID, SURVEYOR, {
      scheduledPublishAt: '2026-07-15T01:30:00.000Z',
      autoCloseAfterN: 300,
    } as never);
    await service.update(SID, SURVEYOR, {
      scheduledPublishAt: null,
      autoCloseAt: null,
    } as never);

    const rows = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SID));
    expect(rows[0].scheduledPublishAt).toBeNull();
  });

  it('抽獎草稿部分更新不可把指定開獎時間改成過去', async () => {
    await db
      .update(schema.surveys)
      .set({
        rewardMode: 'lottery',
        lotteryPrize: '餐券',
        lotteryWinnerCount: 1,
        lotteryDrawMode: 'scheduled',
        lotteryDrawAt: new Date(Date.now() + 60_000),
        lotteryTermsAcceptedAt: new Date(),
      })
      .where(eq(schema.surveys.id, SID));

    await expect(service.update(SID, SURVEYOR, {
      lotteryDrawAt: new Date(Date.now() - 60_000).toISOString(),
    } as never)).rejects.toThrow('指定開獎時間必須晚於目前時間');
  });

  it('修改抽獎獎品後必須重新接受履約條款並更新稽核時間', async () => {
    const acceptedAt = new Date(Date.now() - 60_000);
    await db
      .update(schema.surveys)
      .set({
        rewardMode: 'lottery',
        lotteryPrize: '原餐券',
        lotteryWinnerCount: 1,
        lotteryDrawMode: 'when_full',
        lotteryTermsAcceptedAt: acceptedAt,
      })
      .where(eq(schema.surveys.id, SID));

    await expect(service.update(SID, SURVEYOR, {
      lotteryPrize: '新餐券',
    } as never)).rejects.toThrow('修改抽獎設定後必須重新接受獎品履約條款');

    await service.update(SID, SURVEYOR, {
      lotteryPrize: '新餐券',
      lotteryTermsAccepted: true,
    } as never);
    const [survey] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SID));
    expect(survey.lotteryPrize).toBe('新餐券');
    expect(survey.lotteryTermsAcceptedAt?.getTime()).toBeGreaterThan(acceptedAt.getTime());
  });
});

describe('SurveysService.create — 排程持久化 (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;
  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService);
    await client.exec(`INSERT INTO users (id, email, role, display_name) VALUES ('${SURVEYOR}','c@e.com','surveyor','C');`);
  });
  it('create 時 scheduledPublishAt / autoCloseAfterN 寫入', async () => {
    const s = await service.create(SURVEYOR, {
      title: '排程問卷', type: 'standard', rewardPoints: 10, targetCount: 50,
      deadlineTier: 'standard', isAnonymous: true, aiReviewEnabled: false,
      scheduledPublishAt: '2026-09-01T02:00:00.000Z', autoCloseAfterN: 80, questions: [],
    } as never);
    const rows = await db.select().from(schema.surveys).where(eq(schema.surveys.id, s.id));
    expect(rows[0].scheduledPublishAt).toBeTruthy();
    expect(rows[0].autoCloseAfterN).toBe(80);
  });
});
