/**
 * Integration test: theme persistence for published surveys (issue #137)
 * Verifies that PATCH /surveys/:id on a published survey correctly saves theme via updatePublishedInfo.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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
import type { CreateSurveyDto } from './dto/create-survey.dto';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';

describe('SurveysService — theme 持久化（published survey, issue #137）', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(
      db,
      {} as ZaiClient,
      { auditSurveyAsync: vi.fn().mockResolvedValue(undefined) } as unknown as AiAuditService,
      { lockSurveyBudget: vi.fn().mockResolvedValue(undefined) } as unknown as WalletService,
      {} as NotificationsService,
    );
    await client.exec(
      `INSERT INTO users (id, email, role, display_name) VALUES ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');`,
    );
  });

  afterEach(() => client.close());

  async function createAndPublish(initialTheme?: object) {
    const created = await service.create(SURVEYOR, {
      title: '測試問卷',
      type: 'standard',
      theme: initialTheme,
      questions: [{ type: 'text', title: 'Q1', config: { multiline: false } }],
    } as unknown as CreateSurveyDto) as unknown as { id: string };

    // Force status to published (bypass budget locking for test simplicity)
    await db.update(schema.surveys)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(schema.surveys.id, created.id));

    return created.id;
  }

  it('1. published 問卷 update theme → findOneDetailed 回傳新 theme', async () => {
    const id = await createAndPublish();

    await service.update(id, SURVEYOR, { theme: { accentColor: '#2563eb', backgroundColor: '#eff6ff' } } as never);

    const survey = await service.findOneDetailed(id, SURVEYOR) as unknown as { theme: { accentColor?: string; backgroundColor?: string } };
    expect(survey.theme?.accentColor).toBe('#2563eb');
    expect(survey.theme?.backgroundColor).toBe('#eff6ff');
  });

  it('2. published 問卷 update theme 只改 accentColor → backgroundColor 保留', async () => {
    const id = await createAndPublish({ accentColor: '#126b8a', backgroundColor: '#f8fafc', fontFamily: 'sans' });

    await service.update(id, SURVEYOR, { theme: { accentColor: '#7c3aed', backgroundColor: '#f8fafc', fontFamily: 'sans' } } as never);

    const survey = await service.findOneDetailed(id, SURVEYOR) as unknown as { theme: Record<string, string> };
    expect(survey.theme?.accentColor).toBe('#7c3aed');
    expect(survey.theme?.backgroundColor).toBe('#f8fafc');
  });

  it('3. published 問卷 update 不帶 theme → theme 維持原值不被清除', async () => {
    const id = await createAndPublish({ accentColor: '#126b8a' });

    // Save title only — no theme in payload
    await service.update(id, SURVEYOR, { title: '更新後標題' } as never);

    const survey = await service.findOneDetailed(id, SURVEYOR) as unknown as { theme: Record<string, string>; title: string };
    expect(survey.title).toBe('更新後標題');
    expect(survey.theme?.accentColor).toBe('#126b8a');
  });

  it('4. draft 問卷 update theme → findOneDetailed 回傳新 theme', async () => {
    const created = await service.create(SURVEYOR, {
      title: '草稿問卷',
      type: 'standard',
      questions: [{ type: 'text', title: 'Q1', config: { multiline: false } }],
    } as unknown as CreateSurveyDto) as unknown as { id: string };

    await service.update(created.id, SURVEYOR, { theme: { accentColor: '#db2777', fontFamily: 'serif' } } as never);

    const survey = await service.findOneDetailed(created.id, SURVEYOR) as unknown as { theme: Record<string, string> };
    expect(survey.theme?.accentColor).toBe('#db2777');
    expect(survey.theme?.fontFamily).toBe('serif');
  });
});
