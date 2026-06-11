/**
 * 整合測試：結束設定（感謝頁面）thankYouMessage / thankYouImages / thankYouRedirectUrl 持久化。
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
import { CreateSurveySchema } from './dto/create-survey.dto';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';

describe('SurveysService — 結束設定（感謝頁面）持久化 (integration)', () => {
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

  const thankYou = {
    thankYouMessage: '感謝你的填寫！',
    thankYouImages: ['/uploads/ty1.png', '/uploads/ty2.jpg'],
    thankYouRedirectUrl: 'https://example.com/thanks',
  };

  it('1. create 帶結束設定 → findOneDetailed 回傳三欄位', async () => {
    const created = (await service.create(SURVEYOR, {
      title: '感謝頁問卷',
      type: 'standard',
      ...thankYou,
      questions: [{ type: 'text', title: 'Q1' }],
    } as unknown as CreateSurveyDto)) as unknown as {
      id: string; thankYouMessage: string; thankYouImages: string[]; thankYouRedirectUrl: string;
    };
    expect(created.thankYouMessage).toBe(thankYou.thankYouMessage);
    expect(created.thankYouImages).toEqual(thankYou.thankYouImages);
    expect(created.thankYouRedirectUrl).toBe(thankYou.thankYouRedirectUrl);
  });

  it('2. update 可改寫與清空結束設定', async () => {
    const created = (await service.create(SURVEYOR, {
      title: 'T', type: 'standard', ...thankYou,
    } as unknown as CreateSurveyDto)) as unknown as { id: string };

    await service.update(created.id, SURVEYOR, {
      thankYouMessage: '更新後的感謝詞', thankYouImages: [],
    } as never);
    const r = (await service.findOneDetailed(created.id, SURVEYOR)) as unknown as {
      thankYouMessage: string; thankYouImages: string[]; thankYouRedirectUrl: string;
    };
    expect(r.thankYouMessage).toBe('更新後的感謝詞');
    expect(r.thankYouImages).toEqual([]);
    expect(r.thankYouRedirectUrl).toBe(thankYou.thankYouRedirectUrl); // 未動的欄位保留
  });

  it('3. DTO 驗證：導向連結拒絕非 http/https 協議', () => {
    const result = CreateSurveySchema.safeParse({
      title: 'T',
      thankYouRedirectUrl: 'javascript:alert(1)',
    });
    expect(result.success).toBe(false);
  });
});

describe('SurveysService — 已發布問卷有限度編輯 (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;
  const SURVEYOR2 = '11111111-1111-1111-1111-111111111112';

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService, {} as NotificationsService);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR}', 'c@example.com', 'surveyor', 'C'),
        ('${SURVEYOR2}', 'other@example.com', 'surveyor', 'O');
    `);
  });

  async function createPublished(): Promise<string> {
    const created = (await service.create(SURVEYOR, {
      title: '已發布問卷', type: 'standard',
      questions: [{ type: 'text', title: 'Q1' }],
    } as unknown as CreateSurveyDto)) as unknown as { id: string };
    await client.exec(`UPDATE surveys SET status='published', published_at=NOW() WHERE id='${created.id}';`);
    return created.id;
  }

  it('1. 已發布可改資訊類欄位（標題/說明/感謝頁/受眾）', async () => {
    const id = await createPublished();
    const r = (await service.update(id, SURVEYOR, {
      title: '改過的標題', description: '新說明',
      thankYouMessage: '謝謝！',
      audienceCriteria: { gender: ['female'] },
    } as never)) as unknown as { title: string; description: string; thankYouMessage: string };
    expect(r.title).toBe('改過的標題');
    expect(r.description).toBe('新說明');
    expect(r.thankYouMessage).toBe('謝謝！');
  });

  it('2. 已發布不可改題目或獎勵 → BadRequest', async () => {
    const id = await createPublished();
    await expect(service.update(id, SURVEYOR, {
      questions: [{ type: 'text', title: '換掉的題目' }],
    } as never)).rejects.toThrow('已發布問卷僅能修改');
    await expect(service.update(id, SURVEYOR, {
      rewardPoints: 999,
    } as never)).rejects.toThrow('已發布問卷僅能修改');
  });

  it('3. 非擁有者不可編輯已發布問卷', async () => {
    const id = await createPublished();
    await expect(service.update(id, SURVEYOR2, { title: '駭' } as never))
      .rejects.toThrow('無權操作此問卷');
  });
});
