/**
 * 整合測試:歡迎頁多圖 welcomeImages 的建立/更新持久化。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
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

describe('SurveysService — welcomeImages 持久化 (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService, {} as NotificationsService);
    await client.exec(
      `INSERT INTO users (id, email, role, display_name) VALUES ('${SURVEYOR}', 'c@example.com', 'surveyor', 'C');`,
    );
  });

  const imgs = ['/uploads/a.png', '/uploads/b.jpg', '/uploads/c.webp'];

  it('1. create 帶 welcomeImages → findOneDetailed 依序回傳', async () => {
    const created = (await service.create(SURVEYOR, {
      title: '歡迎頁問卷',
      type: 'standard',
      welcomeImages: imgs,
      questions: [{ type: 'text', title: 'Q1', config: { multiline: false } }],
    } as unknown as CreateSurveyDto)) as unknown as { id: string; welcomeImages: string[] };
    expect(created.welcomeImages).toEqual(imgs);
    const refetched = (await service.findOneDetailed(created.id, SURVEYOR)) as unknown as { welcomeImages: string[] };
    expect(refetched.welcomeImages).toEqual(imgs);
  });

  it('2. update 可改寫 welcomeImages(含清空)', async () => {
    const created = (await service.create(SURVEYOR, {
      title: 'T', type: 'standard', welcomeImages: imgs,
    } as unknown as CreateSurveyDto)) as unknown as { id: string };

    await service.update(created.id, SURVEYOR, { welcomeImages: ['/uploads/x.png'] } as never);
    let r = (await service.findOneDetailed(created.id, SURVEYOR)) as unknown as { welcomeImages: string[] };
    expect(r.welcomeImages).toEqual(['/uploads/x.png']);

    await service.update(created.id, SURVEYOR, { welcomeImages: [] } as never);
    r = (await service.findOneDetailed(created.id, SURVEYOR)) as unknown as { welcomeImages: string[] };
    expect(r.welcomeImages).toEqual([]);
  });

  it('3. 未提供 welcomeImages → null/空,不影響其他欄位', async () => {
    const created = (await service.create(SURVEYOR, {
      title: 'NoImg', type: 'standard',
    } as unknown as CreateSurveyDto)) as unknown as { id: string; welcomeImages: unknown; title: string };
    expect(created.welcomeImages ?? null).toBeNull();
    expect(created.title).toBe('NoImg');
  });
});
