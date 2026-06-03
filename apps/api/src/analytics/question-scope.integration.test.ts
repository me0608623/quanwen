import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AppDb } from '../db';
import * as schema from '../db/schema';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AnalyticsService } from './analytics.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
const RATING = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RATING_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbba';
const RATING_3 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbd';
const OTHER_RATING = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc';
const CHOICE = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YES_NO = 'cccccccc-cccc-cccc-cccc-ccccccccccce';
const OTHER_CHOICE = 'cccccccc-cccc-cccc-cccc-cccccccccccd';

describe('AnalyticsService question scope (integration)', () => {
  let client: PGlite;
  let service: AnalyticsService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    const db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AnalyticsService(db);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
        VALUES
          ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator'),
          ('11111111-1111-1111-1111-111111111112', 'other-creator@example.com', 'surveyor', 'Other Creator'),
          ('22222222-2222-2222-2222-222222222221', 'respondent1@example.com', 'respondent', 'Respondent 1'),
          ('22222222-2222-2222-2222-222222222222', 'respondent2@example.com', 'respondent', 'Respondent 2'),
          ('22222222-2222-2222-2222-222222222223', 'respondent3@example.com', 'respondent', 'Respondent 3');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count) VALUES
        ('${SURVEY}', '${SURVEYOR}', '目前問卷', 'draft', 0, 100),
        ('${OTHER_SURVEY}', '${SURVEYOR}', '其他問卷', 'draft', 0, 100);
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, config) VALUES
        ('${RATING}', '${SURVEY}', 'rating', '目前評分題', 0, NULL),
        ('${RATING_2}', '${SURVEY}', 'rating', '第二評分題', 1, '{"maxRating": 10}'),
        ('${RATING_3}', '${SURVEY}', 'rating', '七分制評分題', 2, '{"maxRating": 7}'),
        ('${OTHER_RATING}', '${OTHER_SURVEY}', 'rating', '其他評分題', 0, NULL),
        ('${CHOICE}', '${SURVEY}', 'single_choice', '目前單選題', 3, NULL),
        ('${YES_NO}', '${SURVEY}', 'single_choice', '是否推薦', 4, '{"variant":"yes_no"}'),
        ('${OTHER_CHOICE}', '${OTHER_SURVEY}', 'single_choice', '其他單選題', 1, NULL);
      INSERT INTO question_options (id, question_id, label, sort_order) VALUES
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '${CHOICE}', 'A', 0),
        ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '${CHOICE}', 'B', 1);
      INSERT INTO survey_responses (id, survey_id, respondent_id, status) VALUES
        ('dddddddd-dddd-dddd-dddd-dddddddddd01', '${SURVEY}', '22222222-2222-2222-2222-222222222221', 'submitted'),
        ('dddddddd-dddd-dddd-dddd-dddddddddd02', '${SURVEY}', '22222222-2222-2222-2222-222222222222', 'submitted'),
        ('dddddddd-dddd-dddd-dddd-dddddddddd03', '${SURVEY}', '22222222-2222-2222-2222-222222222223', 'submitted');
      INSERT INTO response_answers (response_id, question_id, survey_id, rating_value) VALUES
        ('dddddddd-dddd-dddd-dddd-dddddddddd01', '${RATING}', '${SURVEY}', 3),
        ('dddddddd-dddd-dddd-dddd-dddddddddd01', '${RATING_2}', '${SURVEY}', 2),
        ('dddddddd-dddd-dddd-dddd-dddddddddd01', '${RATING_3}', '${SURVEY}', 5),
        ('dddddddd-dddd-dddd-dddd-dddddddddd02', '${RATING}', '${SURVEY}', 3),
        ('dddddddd-dddd-dddd-dddd-dddddddddd02', '${RATING_2}', '${SURVEY}', 4),
        ('dddddddd-dddd-dddd-dddd-dddddddddd02', '${RATING_3}', '${SURVEY}', 7),
        ('dddddddd-dddd-dddd-dddd-dddddddddd03', '${RATING_3}', '${SURVEY}', 6);
      INSERT INTO response_answers (response_id, question_id, survey_id, selected_option_ids) VALUES
        ('dddddddd-dddd-dddd-dddd-dddddddddd01', '${YES_NO}', '${SURVEY}', '["yes"]'),
        ('dddddddd-dddd-dddd-dddd-dddddddddd01', '${CHOICE}', '${SURVEY}', '["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1"]'),
        ('dddddddd-dddd-dddd-dddd-dddddddddd02', '${YES_NO}', '${SURVEY}', '["no"]'),
        ('dddddddd-dddd-dddd-dddd-dddddddddd02', '${CHOICE}', '${SURVEY}', '["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2"]');
    `);
  });

  afterEach(async () => client.close());

  it('rejects cross-survey question ids across analytics endpoints', async () => {
    await expect(service.getDescriptiveStats(SURVEY, SURVEYOR, OTHER_RATING))
      .rejects.toThrow('題目不屬於此問卷');
    await expect(service.getNps(SURVEY, SURVEYOR, OTHER_RATING))
      .rejects.toThrow('題目不屬於此問卷');
    await expect(service.getCrossTab(SURVEY, SURVEYOR, CHOICE, OTHER_CHOICE))
      .rejects.toThrow('題目不屬於此問卷');
    await expect(service.getCorrelation(SURVEY, SURVEYOR, RATING, OTHER_RATING))
      .rejects.toThrow('題目不屬於此問卷');
  });

  it('returns null correlation for constant answers and rejects invalid segment counts', async () => {
    const correlation = await service.getCorrelation(SURVEY, SURVEYOR, RATING, RATING_2);
    expect(correlation.pearsonR).toBeNull();
    expect(correlation.interpretation).toContain('沒有變異');
    await expect(service.getSegmentation(SURVEY, SURVEYOR, Number.NaN))
      .rejects.toThrow('分群數 k 必須是 2 至 10 的整數');
    await expect(service.getSegmentation(SURVEY, SURVEYOR, 1))
      .rejects.toThrow('分群數 k 必須是 2 至 10 的整數');
  });

  it('rejects missing access and comparisons that use the same question twice', async () => {
    await expect(service.getDescriptiveStats('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', SURVEYOR, RATING))
      .rejects.toMatchObject({ status: 404 });
    await expect(service.getDescriptiveStats(SURVEY, '11111111-1111-1111-1111-111111111112', RATING))
      .rejects.toMatchObject({ status: 403 });
    await expect(service.getCrossTab(SURVEY, SURVEYOR, CHOICE, CHOICE))
      .rejects.toThrow('交叉分析必須選擇兩個不同題目');
    await expect(service.getCorrelation(SURVEY, SURVEYOR, RATING, RATING))
      .rejects.toThrow('相關性分析必須選擇兩個不同題目');
  });

  it('normalizes NPS from configured scale instead of observed low scores', async () => {
    const nps = await service.getNps(SURVEY, SURVEYOR, RATING_2);
    expect(nps.total).toBe(2);
    expect(nps.detractors).toBe(2);
    expect(nps.passives).toBe(0);
    expect(nps.promoters).toBe(0);
    expect(nps.nps).toBe(-100);
  });

  it('normalizes arbitrary configured NPS scales to ten points', async () => {
    const nps = await service.getNps(SURVEY, SURVEYOR, RATING_3);
    expect(nps.total).toBe(3);
    expect(nps.detractors).toBe(1);
    expect(nps.passives).toBe(1);
    expect(nps.promoters).toBe(1);
    expect(nps.promoters + nps.passives + nps.detractors).toBe(nps.total);
    expect(nps.nps).toBe(0);
    expect(nps).toMatchObject({ scaleMin: 1, scaleMax: 7, normalizedToTenPointScale: true });
  });

  it('normalizes mixed rating scales before respondent segmentation', async () => {
    const segmentation = await service.getSegmentation(SURVEY, SURVEYOR, 2);
    expect(segmentation.normalizedToCommonScale).toBe(true);
    expect(segmentation.totalRespondents).toBe(3);
    expect(new Set(segmentation.segments.map((segment) => segment.segmentId)).size).toBe(segmentation.segments.length);
    expect(segmentation.segments.every((segment) => segment.label.includes('相對'))).toBe(true);
    expect(segmentation.segments.every((segment) =>
      Object.values(segment.avgRatings).every((rating) =>
        rating.answeredCount >= 0 &&
        (rating.avg === null || (rating.avg >= rating.scaleMin && rating.avg <= rating.scaleMax)) &&
        (rating.relativeAvg === null || (rating.relativeAvg >= 0 && rating.relativeAvg <= 1))
      ),
    )).toBe(true);
  });

  it('includes synthetic yes-no choices in cross-tab analysis', async () => {
    const crossTab = await service.getCrossTab(SURVEY, SURVEYOR, YES_NO, CHOICE);
    expect(crossTab.rows).toEqual(['是', '否']);
    expect(crossTab.cols).toEqual(['A', 'B']);
    expect(crossTab.matrix).toEqual([[1, 0], [0, 1]]);
    expect(crossTab.cramersV).toBe(1);
  });
});
