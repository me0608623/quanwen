/**
 * 整合測試：SurveysService.duplicate()
 * 紅線：複製產生新草稿、標題加「(副本)」、題目與選項完整複製、原問卷不變。
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
import type { NotificationsService } from '../notifications/notifications.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SRC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const Q1 = 'cccccccc-cccc-cccc-cccc-ccccccccc001';
const Q2 = 'cccccccc-cccc-cccc-cccc-ccccccccc002';

describe('SurveysService.duplicate (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService, {} as NotificationsService);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, base_reward_points, deadline_tier, target_count)
        VALUES ('${SRC}', '${SURVEYOR}', '原問卷', 'published', 42, 35, 'express', 100);
      INSERT INTO survey_questions (id, survey_id, type, title, description, sort_order, is_required)
        VALUES ('${Q1}', '${SRC}', 'single_choice', '你喜歡哪個?', NULL, 0, true),
               ('${Q2}', '${SRC}', 'text', '其他建議', '選填', 1, false);
      INSERT INTO question_options (id, question_id, label, sort_order)
        VALUES (gen_random_uuid(), '${Q1}', 'A', 0),
               (gen_random_uuid(), '${Q1}', 'B', 1);
    `);
  });

  it('複製產生新草稿，標題加「(副本)」、題目與選項完整、加急倍率重算', async () => {
    const dup = await service.duplicate(SRC, SURVEYOR);

    expect(dup.id).not.toBe(SRC);
    expect(dup.title).toBe('原問卷 (副本)');
    expect(dup.status).toBe('draft');
    // base 35 + express(1.2) → 42（create 重算）
    expect(dup.baseRewardPoints).toBe(35);
    expect(dup.rewardPoints).toBe(42);
    expect(dup.deadlineTier).toBe('express');
    expect(dup.questions).toHaveLength(2);
    const single = dup.questions.find((q) => q.type === 'single_choice');
    expect(single?.options).toHaveLength(2);
    expect(dup.questions.find((q) => q.type === 'text')?.isRequired).toBe(false);

    // 原問卷不受影響
    const srcRows = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SRC));
    expect(srcRows[0].status).toBe('published');
    expect(srcRows[0].title).toBe('原問卷');
  });

  it('非擁有者複製被拒', async () => {
    await expect(
      service.duplicate(SRC, '99999999-9999-9999-9999-999999999999'),
    ).rejects.toThrow();
  });

  it('抽獎問卷不可直接複製，必須重新接受履約條款', async () => {
    await client.exec(`
      UPDATE surveys
      SET reward_mode = 'lottery', lottery_prize = '餐券', lottery_terms_accepted_at = NOW()
      WHERE id = '${SRC}';
    `);

    await expect(service.duplicate(SRC, SURVEYOR)).rejects.toThrow('重新接受獎品履約條款');
  });
});
