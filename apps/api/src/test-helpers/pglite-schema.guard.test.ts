/**
 * Schema guard — verifies that the canonical PGlite DDL (pglite-ddl.ts)
 * includes all columns required by the Drizzle schema.
 *
 * If this test FAILS, update pglite-ddl.ts (and all integration test files
 * that inline their own DDL) to add the missing column.
 *
 * If integration tests fail with "column X does not exist", this guard test
 * will also fail and tell you exactly which column is missing.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { FULL_SCHEMA_DDL } from './pglite-ddl';
import * as schema from '../db/schema';

describe('PGlite DDL schema guard', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  afterAll(async () => {
    await client?.close();
  });

  it('creates schema without errors', async () => {
    client = new PGlite();
    await expect(client.exec(FULL_SCHEMA_DDL)).resolves.not.toThrow();
    db = drizzle(client, { schema });
  });

  it('survey_responses has sentiment column (QUA-87)', async () => {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'survey_responses' AND column_name = 'sentiment'`,
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].column_name).toBe('sentiment');
  });

  it('surveys has deadline_tier column (QUA-34)', async () => {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'surveys' AND column_name = 'deadline_tier'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('surveys has base_reward_points column (QUA-34)', async () => {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'surveys' AND column_name = 'base_reward_points'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('response_answers has survey_id column', async () => {
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'response_answers' AND column_name = 'survey_id'`,
    );
    expect(result.rows.length).toBe(1);
  });

  it('response_status enum includes pending_review', async () => {
    const result = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'response_status'
       ORDER BY e.enumsortorder`,
    );
    expect(result.rows.map((row) => row.enumlabel)).toContain('pending_review');
  });

  it('hot-path indexes exist for responses export queries', async () => {
    const result = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
       AND indexname IN (
         'survey_responses_survey_status_submitted_idx',
         'response_answers_survey_question_idx'
       )`,
    );
    expect(result.rows.map((row) => row.indexname).sort()).toEqual([
      'response_answers_survey_question_idx',
      'survey_responses_survey_status_submitted_idx',
    ]);
  });

  it('Drizzle can select from survey_responses without column errors', async () => {
    // This exercises the ORM mapping — if any column in the schema is missing
    // from the DDL, Drizzle will fail with "column does not exist"
    const rows = await db.select().from(schema.surveyResponses).limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });
});
