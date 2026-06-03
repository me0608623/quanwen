import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AnalyticsService } from './analytics.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const Q1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const Q2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const Q3 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const RESPONDENT_1 = '22222222-2222-2222-2222-222222222222';
const RESPONDENT_2 = '33333333-3333-3333-3333-333333333333';
const RESPONDENT_3 = '44444444-4444-4444-4444-444444444444';
const RESPONSE_1 = '55555555-5555-5555-5555-555555555555';
const RESPONSE_2 = '66666666-6666-6666-6666-666666666666';
const RESPONSE_3 = '77777777-7777-7777-7777-777777777777';

describe('AnalyticsService.updateScaleSettings (integration)', () => {
  let db: AppDb;
  let service: AnalyticsService;

  beforeEach(async () => {
    const client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AnalyticsService(db);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
        VALUES ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count)
        VALUES ('${SID}', '${SURVEYOR}', '量表問卷', 'draft', 0, 100);
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, config) VALUES
        ('${Q1}', '${SID}', 'rating', '正向題', 0, '{"maxRating": 5}'),
        ('${Q2}', '${SID}', 'rating', '反向題', 1, '{"maxRating": 7, "scaleStart": 0}'),
        ('${Q3}', '${SID}', 'rating', '其他構念題', 2, '{"maxRating": 5}');
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${RESPONDENT_1}', 'r1@example.com', 'respondent', 'R1'),
        ('${RESPONDENT_2}', 'r2@example.com', 'respondent', 'R2'),
        ('${RESPONDENT_3}', 'r3@example.com', 'respondent', 'R3');
      INSERT INTO survey_responses (id, survey_id, respondent_id, status) VALUES
        ('${RESPONSE_1}', '${SID}', '${RESPONDENT_1}', 'submitted'),
        ('${RESPONSE_2}', '${SID}', '${RESPONDENT_2}', 'submitted'),
        ('${RESPONSE_3}', '${SID}', '${RESPONDENT_3}', 'submitted');
      INSERT INTO response_answers (response_id, survey_id, question_id, rating_value) VALUES
        ('${RESPONSE_1}', '${SID}', '${Q1}', 4),
        ('${RESPONSE_1}', '${SID}', '${Q2}', 2),
        ('${RESPONSE_2}', '${SID}', '${Q1}', 3),
        ('${RESPONSE_3}', '${SID}', '${Q3}', 5);
    `);
  });

  it('persists reverse flags and uses them as the default on the next analysis request', async () => {
    await service.updateScaleSettings(SID, SURVEYOR, [Q1, Q2], [Q2]);

    const questions = await db
      .select({ id: schema.surveyQuestions.id, config: schema.surveyQuestions.config })
      .from(schema.surveyQuestions)
      .where(eq(schema.surveyQuestions.surveyId, SID));
    expect(questions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: Q1, config: { maxRating: 5, reverseScored: false, scaleIncluded: true } }),
      expect.objectContaining({ id: Q2, config: { maxRating: 7, scaleStart: 0, reverseScored: true, scaleIncluded: true } }),
      expect.objectContaining({ id: Q3, config: { maxRating: 5, reverseScored: false, scaleIncluded: false } }),
    ]));

    const analysis = await service.getScaleReliability(SID, SURVEYOR);
    expect(analysis.itemCount).toBe(2);
    expect(analysis.completeResponseCount).toBe(1);
    expect(analysis.excludedIncompleteResponseCount).toBe(2);
    expect(analysis.normalizedToCommonScale).toBe(true);
    expect(analysis.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: Q1, reverseScored: false, selectedForScale: true, mean: 4 }),
      expect.objectContaining({ questionId: Q2, reverseScored: true, selectedForScale: true, mean: 5, rawMean: 2 }),
    ]));
    expect(analysis.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: Q3, reverseScored: false, selectedForScale: false }),
    ]));
    expect(analysis.availableItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: Q3, reverseScored: false, selectedForScale: false }),
    ]));
  });

  it('rejects non-rating or foreign question ids', async () => {
    await expect(service.updateScaleSettings(SID, SURVEYOR, [Q1, Q2], ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee']))
      .rejects.toThrow('量表設定只能選擇此問卷的評分題');
    await expect(service.getScaleReliability(SID, SURVEYOR, [Q1, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee']))
      .rejects.toThrow('量表分析只能選擇此問卷的評分題');
  });

  it('rejects reverse flags for questions outside the selected construct', async () => {
    await expect(service.updateScaleSettings(SID, SURVEYOR, [Q1, Q2], [Q3]))
      .rejects.toThrow('反向題必須先納入量表題組');
    await expect(service.getScaleReliability(SID, SURVEYOR, [Q1, Q2], [Q3]))
      .rejects.toThrow('反向題必須先納入量表題組');
  });

  it('reports the selected construct from the current preview instead of persisted settings', async () => {
    await service.updateScaleSettings(SID, SURVEYOR, [Q1, Q2], [Q2]);

    const preview = await service.getScaleReliability(SID, SURVEYOR, [Q1, Q3], []);
    expect(preview.availableItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: Q1, selectedForScale: true }),
      expect.objectContaining({ questionId: Q2, selectedForScale: false }),
      expect.objectContaining({ questionId: Q3, selectedForScale: true }),
    ]));
  });
});
