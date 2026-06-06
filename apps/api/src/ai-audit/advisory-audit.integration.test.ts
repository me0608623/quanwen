import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import type { ZaiClient } from './zai.client';
import type { NotificationsService } from '../notifications/notifications.service';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AiAuditService } from './ai-audit.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('AiAuditService.auditSurveyAsync advisory 模式（integration）', () => {
  let client: PGlite;
  let db: AppDb;
  let service: AiAuditService;
  let notificationsSent: Array<{ userId: string; title: string; type: string }>;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    notificationsSent = [];
    const notifications = {
      create: async (dto: { userId: string; title: string; type: string }) => {
        notificationsSent.push({ userId: dto.userId, title: dto.title, type: dto.type });
      },
    } as unknown as NotificationsService;
    service = new AiAuditService(db, {} as ZaiClient, notifications);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
      VALUES ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, published_at)
      VALUES ('${SURVEY}', '${SURVEYOR}', '已上架問卷', 'published', NOW());
    `);
  });

  afterEach(async () => client.close());

  it('低分掃描：不改 status、不下架，只通知建立者改善', async () => {
    vi.spyOn(service, 'evaluateSurvey').mockResolvedValue({
      score: 30, passed: false, issues: ['題目誘導性過強'], suggestion: '改用中性措辭',
    });

    await service.auditSurveyAsync(SURVEY);

    const [row] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SURVEY));
    expect(row.status).toBe('published');     // 不自動下架
    expect(row.publishedAt).not.toBeNull();
    expect(row.aiScore).toBe(30);             // 分數仍落地
    expect(notificationsSent).toHaveLength(1);
    expect(notificationsSent[0].title).toContain('品質提醒');
  });

  it('高分掃描：只記分數、不發通知', async () => {
    vi.spyOn(service, 'evaluateSurvey').mockResolvedValue({
      score: 90, passed: true, issues: [], suggestion: '',
    });

    await service.auditSurveyAsync(SURVEY);

    const [row] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SURVEY));
    expect(row.status).toBe('published');
    expect(row.aiScore).toBe(90);
    expect(notificationsSent).toHaveLength(0);
  });

  it('舊資料相容：pending_review 問卷仍維持自動 published / rejected', async () => {
    await db.update(schema.surveys)
      .set({ status: 'pending_review', publishedAt: null })
      .where(eq(schema.surveys.id, SURVEY));

    vi.spyOn(service, 'evaluateSurvey').mockResolvedValue({
      score: 20, passed: false, issues: ['垃圾內容'], suggestion: '',
    });

    await service.auditSurveyAsync(SURVEY);

    const [row] = await db.select().from(schema.surveys).where(eq(schema.surveys.id, SURVEY));
    expect(row.status).toBe('rejected');
    expect(notificationsSent[0].type).toBe('survey_rejected');
  });
});
