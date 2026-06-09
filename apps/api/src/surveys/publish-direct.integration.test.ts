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

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('SurveysService.publish 直接上架（integration）', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;
  let auditSurveyAsync: ReturnType<typeof vi.fn>;
  let lockSurveyBudget: ReturnType<typeof vi.fn>;

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
      VALUES ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points)
      VALUES ('${SURVEY}', '${SURVEYOR}', '直接上架測試', 'draft', 50);
      INSERT INTO survey_questions (id, survey_id, type, title)
      VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${SURVEY}', 'text', '意見');
    `);
  });

  afterEach(async () => client.close());

  it('aiReviewEnabled=true（預設）發布即上架，不進 pending_review', async () => {
    const result = await service.publish(SURVEY, SURVEYOR);
    expect(result.message).toContain('已上架');

    const [row] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SURVEY));
    expect(row.status).toBe('published');
    expect(row.publishedAt).not.toBeNull();

    // AI 品質掃描仍要 fire（advisory），預算仍要鎖（第三引數為 tx 物件）
    expect(auditSurveyAsync).toHaveBeenCalledWith(SURVEY);
    expect(lockSurveyBudget).toHaveBeenCalledWith(SURVEYOR, SURVEY, expect.anything());
  });
});
