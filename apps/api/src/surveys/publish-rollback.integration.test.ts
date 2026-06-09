/**
 * Integration test: publish() atomicity — budget lock failure rolls back survey status.
 * Covers acceptance criteria for issue #39: 問卷發布失敗未回滾。
 *
 * When lockSurveyBudget throws inside the same db.transaction() as the status update,
 * the entire transaction rolls back and the survey stays in 'draft'.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import type { ZaiClient } from '../ai-audit/zai.client';
import type { AiAuditService } from '../ai-audit/ai-audit.service';
import type { WalletService } from '../wallet/wallet.service';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { SurveysService } from './surveys.service';

const SURVEYOR = '22222222-2222-2222-2222-222222222222';
const SURVEY = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('SurveysService.publish — budget lock 失敗回滾 (issue #39)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;
  let lockSurveyBudget: ReturnType<typeof vi.fn>;
  let auditSurveyAsync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    auditSurveyAsync = vi.fn().mockResolvedValue(undefined);
    lockSurveyBudget = vi.fn().mockResolvedValue(undefined);
    service = new SurveysService(
      db,
      {} as ZaiClient,
      { auditSurveyAsync } as unknown as AiAuditService,
      { lockSurveyBudget } as unknown as WalletService,
    );
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${SURVEYOR}', 'rollback@example.com', 'surveyor', 'Rollback Tester');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points)
      VALUES ('${SURVEY}', '${SURVEYOR}', '回滾測試問卷', 'draft', 50);
      INSERT INTO survey_questions (id, survey_id, type, title)
      VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '${SURVEY}', 'text', '你的意見');
    `);
  });

  afterEach(async () => client.close());

  it('budget lock 拋出例外時，survey 狀態回滾至 draft', async () => {
    lockSurveyBudget.mockRejectedValue(new Error('模擬預算鎖定失敗'));

    await expect(service.publish(SURVEY, SURVEYOR)).rejects.toThrow('模擬預算鎖定失敗');

    const [row] = await db
      .select({ status: schema.surveys.status, publishedAt: schema.surveys.publishedAt })
      .from(schema.surveys)
      .where(eq(schema.surveys.id, SURVEY));

    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
  });

  it('budget lock 成功時，survey 狀態更新為 published', async () => {
    await service.publish(SURVEY, SURVEYOR);

    const [row] = await db
      .select({ status: schema.surveys.status, publishedAt: schema.surveys.publishedAt })
      .from(schema.surveys)
      .where(eq(schema.surveys.id, SURVEY));

    expect(row.status).toBe('published');
    expect(row.publishedAt).not.toBeNull();
    expect(lockSurveyBudget).toHaveBeenCalledWith(SURVEYOR, SURVEY, expect.anything());
  });

  it('aiReviewEnabled=false 且 budget lock 失敗時，survey 仍回滾至 draft', async () => {
    await client.exec(`
      UPDATE surveys SET ai_review_enabled = false WHERE id = '${SURVEY}';
    `);
    lockSurveyBudget.mockRejectedValue(new Error('模擬鎖定失敗（無 AI 審核）'));

    await expect(service.publish(SURVEY, SURVEYOR)).rejects.toThrow();

    const [row] = await db
      .select({ status: schema.surveys.status })
      .from(schema.surveys)
      .where(eq(schema.surveys.id, SURVEY));

    expect(row.status).toBe('draft');
  });
});
