import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('SurveysService.remove lottery evidence retention (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('11111111-1111-1111-1111-111111111111', 'creator@example.com', 'surveyor', 'Creator');
    `);
  });

  afterEach(async () => client.close());

  it('deletes an ordinary draft', async () => {
    await client.exec(`
      INSERT INTO surveys (id, surveyor_id, title, status)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', '普通草稿', 'draft');
    `);

    await expect(service.remove(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      '11111111-1111-1111-1111-111111111111',
    )).resolves.toEqual({ message: '草稿已刪除' });
  });

  it('keeps a draft with lottery evidence for platform audit', async () => {
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('22222222-2222-2222-2222-222222222222', 'winner@example.com', 'respondent', 'Winner');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_mode, lottery_prize, lottery_drawn_at)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', '已有抽獎證據', 'draft', 'lottery', '餐券', NOW());
      INSERT INTO survey_responses (id, survey_id, respondent_id, status)
      VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '22222222-2222-2222-2222-222222222222', 'submitted');
      INSERT INTO survey_lottery_results (id, survey_id, response_id, respondent_id, is_winner, prize)
      VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', true, '餐券');
    `);

    await expect(service.remove(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('平台須保留履約與稽核紀錄');

    const [survey] = await db
      .select({ id: schema.surveys.id })
      .from(schema.surveys)
      .where(eq(schema.surveys.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'));
    expect(survey).toBeDefined();
  });
});
