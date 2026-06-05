/**
 * 整合測試:SurveysService.create() 的批次插入(#3)與免 re-fetch 回傳(#4)。
 *
 * 安全網:create() 的回傳必須與隨後 findOneDetailed() 完全一致。
 * create() 改為記憶體組裝(不再 re-fetch)後,此 deepEqual 仍須成立,
 * 任何 shape 漂移都會被這個測試擋下。
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
import type { CreateSurveyDto } from './dto/create-survey.dto';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';

describe('SurveysService.create — 批次插入 + 免 re-fetch (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: SurveysService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new SurveysService(db, {} as ZaiClient, {} as AiAuditService, {} as WalletService);
    await client.exec(
      `INSERT INTO users (id, email, role, display_name) VALUES ('${SURVEYOR}', 'c@example.com', 'surveyor', 'C');`,
    );
  });

  const dto = (): CreateSurveyDto =>
    ({
      title: '批次插入測試問卷',
      type: 'standard',
      questions: [
        { type: 'single_choice', title: '單選', isRequired: true, sortOrder: 0,
          options: [{ label: 'A', sortOrder: 0 }, { label: 'B', sortOrder: 1 }] },
        { type: 'text', title: '簡答', isRequired: false, sortOrder: 1, config: { multiline: true } },
        { type: 'multiple_choice', title: '複選', isRequired: true, sortOrder: 2,
          options: [{ label: 'X', sortOrder: 0 }, { label: 'Y', sortOrder: 1 }, { label: 'Z', sortOrder: 2 }] },
      ],
    } as unknown as CreateSurveyDto);

  it('1. 題目與選項完整落 DB', async () => {
    const created = await service.create(SURVEYOR, dto());
    const qRows = await db.select().from(schema.surveyQuestions).where(eq(schema.surveyQuestions.surveyId, created.id));
    expect(qRows).toHaveLength(3);
    const optRows = await db.select().from(schema.questionOptions);
    expect(optRows).toHaveLength(5); // 2 + 0 + 3
  });

  it('2. create() 回傳與 findOneDetailed() 完全一致(免 re-fetch 不得有 shape 漂移)', async () => {
    const created = await service.create(SURVEYOR, dto());
    const refetched = await service.findOneDetailed(created.id, SURVEYOR);
    expect(created).toEqual(refetched);
  });

  it('3. 回傳題目依 sortOrder 排序、選項正確巢狀', async () => {
    const created = (await service.create(SURVEYOR, dto())) as unknown as {
      questions: Array<{ type: string; sortOrder: number; options: unknown[] }>;
    };
    expect(created.questions.map((q) => q.sortOrder)).toEqual([0, 1, 2]);
    expect(created.questions[0].options).toHaveLength(2);
    expect(created.questions[1].options).toHaveLength(0);
    expect(created.questions[2].options).toHaveLength(3);
  });

  it('4. 大量題目(50)批次插入正確', async () => {
    const big = {
      title: '大問卷',
      type: 'standard',
      questions: Array.from({ length: 50 }, (_, i) => ({
        type: 'text', title: `Q${i + 1}`, isRequired: false, sortOrder: i, config: { multiline: false },
      })),
    } as unknown as CreateSurveyDto;
    const created = (await service.create(SURVEYOR, big)) as unknown as { id: string; questions: unknown[] };
    expect(created.questions).toHaveLength(50);
    const refetched = await service.findOneDetailed(created.id, SURVEYOR);
    expect(created).toEqual(refetched);
  });
});
