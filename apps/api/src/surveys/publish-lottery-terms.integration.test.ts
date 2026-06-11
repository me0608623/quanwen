import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AppDb } from '../db';
import type { ZaiClient } from '../ai-audit/zai.client';
import type { AiAuditService } from '../ai-audit/ai-audit.service';
import type { WalletService } from '../wallet/wallet.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { SurveysService } from './surveys.service';

describe('SurveysService.publish lottery terms retention (integration)', () => {
  let client: PGlite;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    const db = drizzle(client) as unknown as AppDb;
    service = new SurveysService(
      db,
      {} as ZaiClient,
      { auditSurveyAsync: vi.fn().mockResolvedValue(undefined) } as unknown as AiAuditService,
      { lockSurveyBudget: vi.fn().mockResolvedValue(undefined) } as unknown as WalletService,
      {} as NotificationsService,
    );
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('11111111-1111-1111-1111-111111111111', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_mode, lottery_prize)
      VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '缺少承諾時間', 'draft', 'lottery', '餐券');
      INSERT INTO survey_questions (id, survey_id, type, title)
      VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'text', '意見');
    `);
  });

  afterEach(async () => client.close());

  it('rejects manual publishing without a retained terms acceptance timestamp', async () => {
    await expect(service.publish(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('發布前必須接受獎品履約條款');
  });
});
