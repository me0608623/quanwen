import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { AppDb } from '../db';
import * as schema from '../db/schema';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AnalyticsService } from './analytics.service';

const SURVEYOR = '11111111-1111-1111-1111-111111111111';
const SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const QUESTION = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RESPONSE_COUNT = 10_000;

describe('AnalyticsService SQL aggregation benchmark (10k responses)', () => {
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
        VALUES ('${SURVEY}', '${SURVEYOR}', 'Benchmark Survey', 'published', 0, 20000);
      INSERT INTO survey_questions (id, survey_id, type, title, sort_order)
        VALUES ('${QUESTION}', '${SURVEY}', 'rating', 'Rating Question', 0);
    `);

    // Insert respondents + responses + answers in batches of 500 to stay within PGlite limits
    const BATCH = 500;
    for (let offset = 0; offset < RESPONSE_COUNT; offset += BATCH) {
      const end = Math.min(offset + BATCH, RESPONSE_COUNT);
      const users: string[] = [];
      const responses: string[] = [];
      const answers: string[] = [];
      for (let i = offset; i < end; i++) {
        const uid = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
        const rid = `00000001-0000-0000-0000-${String(i).padStart(12, '0')}`;
        const rating = (i % 5) + 1;
        users.push(`('${uid}', 'u${i}@example.com', 'respondent', 'U${i}')`);
        responses.push(`('${rid}', '${SURVEY}', '${uid}', 'submitted', NOW())`);
        answers.push(`('${rid}', '${SURVEY}', '${QUESTION}', ${rating})`);
      }
      await client.exec(`
        INSERT INTO users (id, email, role, display_name) VALUES ${users.join(',')};
        INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at) VALUES ${responses.join(',')};
        INSERT INTO response_answers (response_id, survey_id, question_id, rating_value) VALUES ${answers.join(',')};
      `);
    }
  }, 120_000);

  afterEach(async () => client.close());

  it('getDescriptiveStats for 10k responses completes in under 500ms', async () => {
    const start = performance.now();
    const stats = await service.getDescriptiveStats(SURVEY, SURVEYOR, QUESTION);
    const elapsed = performance.now() - start;

    expect(stats.count).toBe(RESPONSE_COUNT);
    expect(stats.mean).toBeCloseTo(3, 0);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(elapsed).toBeLessThan(500);
  });

  it('getAllDescriptiveStats for 10k responses completes in under 500ms', async () => {
    const start = performance.now();
    const result = await service.getAllDescriptiveStats(SURVEY, SURVEYOR);
    const elapsed = performance.now() - start;

    expect(result[QUESTION].count).toBe(RESPONSE_COUNT);
    expect(result[QUESTION].mean).toBeCloseTo(3, 0);
    expect(elapsed).toBeLessThan(500);
  });
});
