/**
 * 整合測試:AI 分析報告持久化(survey_ai_reports)。
 * 回歸:報告原本只在記憶體快取,切換報告類型 / 重新整理就消失。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AiReportStoreService } from './ai-report-store.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const SURVEY = '33333333-3333-3333-3333-333333333333';

describe('AiReportStoreService (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: AiReportStoreService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AiReportStoreService(db);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR}', 'a@example.com', 'surveyor', 'A'),
        ('${OTHER}', 'b@example.com', 'surveyor', 'B');
      INSERT INTO surveys (id, surveyor_id, title) VALUES ('${SURVEY}', '${SURVEYOR}', 'T');
    `);
  });

  const payload = { summary: '摘要', keyFindings: ['發現1'] };

  it('save 後 getSaved 回傳 payload 與 generatedAt', async () => {
    await service.save(SURVEY, 'simple', payload);
    const saved = await service.getSaved(SURVEYOR, SURVEY, 'simple');
    expect(saved?.payload).toEqual(payload);
    expect(saved?.generatedAt).toBeInstanceOf(Date);
  });

  it('simple / detailed 各自獨立保存', async () => {
    await service.save(SURVEY, 'simple', { summary: 's' });
    await service.save(SURVEY, 'detailed', { summary: 'd' });
    const s = await service.getSaved(SURVEYOR, SURVEY, 'simple');
    const d = await service.getSaved(SURVEYOR, SURVEY, 'detailed');
    expect((s?.payload as { summary: string }).summary).toBe('s');
    expect((d?.payload as { summary: string }).summary).toBe('d');
  });

  it('重複 save 同類型 → upsert 覆寫', async () => {
    await service.save(SURVEY, 'simple', { summary: '舊' });
    await service.save(SURVEY, 'simple', { summary: '新' });
    const saved = await service.getSaved(SURVEYOR, SURVEY, 'simple');
    expect((saved?.payload as { summary: string }).summary).toBe('新');
  });

  it('未生成過 → getSaved 回 null', async () => {
    const saved = await service.getSaved(SURVEYOR, SURVEY, 'simple');
    expect(saved).toBeNull();
  });

  it('非問卷擁有者 getSaved 回 null(不洩漏報告)', async () => {
    await service.save(SURVEY, 'simple', payload);
    const saved = await service.getSaved(OTHER, SURVEY, 'simple');
    expect(saved).toBeNull();
  });
});
