import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AppDb } from '../db';
import * as schema from '../db/schema';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AnalyticsService } from './analytics.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const Q_FEAR = 'cccccccc-cccc-cccc-cccc-cccccccccc01'; // 單選：怕蛇？
const Q_MEDIA = 'cccccccc-cccc-cccc-cccc-cccccccccc02'; // 多選：接受媒材
const OPT_FEAR_YES = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const OPT_FEAR_NO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
const OPT_CARTOON = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03';
const OPT_REAL = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';

describe('AnalyticsService.getSegmentation 純選擇題問卷（integration）', () => {
  let client: PGlite;
  let service: AnalyticsService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    const db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AnalyticsService(db);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name)
        VALUES ('${SURVEYOR}', 'creator@example.com', 'surveyor', 'Creator');
      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count)
        VALUES ('${SURVEY}', '${SURVEYOR}', '純選擇題問卷', 'published', 0, 100);
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order) VALUES
        ('${Q_FEAR}', '${SURVEY}', 'single_choice', '是否怕蛇', 0),
        ('${Q_MEDIA}', '${SURVEY}', 'multiple_choice', '接受哪些媒材', 1);
      INSERT INTO question_options (id, question_id, label, sort_order) VALUES
        ('${OPT_FEAR_YES}', '${Q_FEAR}', '怕', 0),
        ('${OPT_FEAR_NO}', '${Q_FEAR}', '不怕', 1),
        ('${OPT_CARTOON}', '${Q_MEDIA}', '卡通圖案', 0),
        ('${OPT_REAL}', '${Q_MEDIA}', '真實照片', 1);
    `);

    // 6 位填答者：3 位「怕蛇+卡通」、3 位「不怕+真實照片」（兩個清楚可分的族群）
    const personas: Array<[string, string[]]> = [];
    for (let i = 1; i <= 3; i++) personas.push([`r${i}`, [OPT_FEAR_YES, OPT_CARTOON]]);
    for (let i = 4; i <= 6; i++) personas.push([`r${i}`, [OPT_FEAR_NO, OPT_REAL]]);

    for (let i = 0; i < personas.length; i++) {
      const uid = `22222222-2222-2222-2222-22222222220${i + 1}`;
      const rid = `33333333-3333-3333-3333-33333333330${i + 1}`;
      const [, opts] = personas[i];
      const fearOpt = opts[0];
      const mediaOpt = opts[1];
      await client.exec(`
        INSERT INTO users (id, email, role, display_name)
          VALUES ('${uid}', 'r${i + 1}@example.com', 'respondent', 'R${i + 1}');
        INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at)
          VALUES ('${rid}', '${SURVEY}', '${uid}', 'submitted', NOW());
        INSERT INTO response_answers (response_id, survey_id, question_id, selected_option_ids) VALUES
          ('${rid}', '${SURVEY}', '${Q_FEAR}', '["${fearOpt}"]'::jsonb),
          ('${rid}', '${SURVEY}', '${Q_MEDIA}', '["${mediaOpt}"]'::jsonb);
      `);
    }
  });

  afterEach(async () => client.close());

  it('純選擇題問卷可分群，且兩個族群被正確分開', async () => {
    const result = await service.getSegmentation(SURVEY, SURVEYOR, 2);

    expect(result.totalRespondents).toBe(6);
    expect(result.segments).toHaveLength(2);
    // 兩群各 3 人
    expect(result.segments.map((s) => s.count).sort()).toEqual([3, 3]);

    // 每群都有選項輪廓，且輪廓內最高選取率選項是該族群的特徵選項（100%）
    for (const seg of result.segments) {
      expect(Object.keys(seg.choiceProfiles)).toHaveLength(2);
      const fearProfile = seg.choiceProfiles[Q_FEAR];
      expect(fearProfile.topOptions[0].pct).toBe(1);
    }

    // 群標籤含區辨選項提示
    expect(result.segments.every((s) => s.label.includes('傾向'))).toBe(true);
  });

  it('沒有任何填答時回空結果而非報錯', async () => {
    await client.exec(`DELETE FROM response_answers; DELETE FROM survey_responses;`);
    const result = await service.getSegmentation(SURVEY, SURVEYOR, 3);
    expect(result.segments).toHaveLength(0);
    expect(result.totalRespondents).toBe(0);
  });
});
