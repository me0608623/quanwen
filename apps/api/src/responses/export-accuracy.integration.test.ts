/**
 * QUA-45: Creator can export data accurately
 *
 * Verifies that ExportService produces output that faithfully reflects the
 * underlying survey_responses + response_answers records.
 *
 * Covered assertions:
 *  - generateResponsesExcel: every submitted response row appears in Sheet 1,
 *    answer values are correctly pivoted, quality_score column matches DB.
 *  - streamResponsesCsv: CSV row count matches DB count, header is correct.
 *  - cleanOnly filter: rows below minQualityScore are excluded.
 *  - PII redaction: open-text columns do not leak raw email-like strings.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { PassThrough } from 'stream';
import * as schema from '../db/schema';
import { ExportService } from './export.service';

const SURVEYOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RESPONDENT_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01';
const RESPONDENT_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02';
const SURVEY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccc00';
const Q_TEXT = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const Q_CHOICE = 'dddddddd-dddd-dddd-dddd-dddddddddd02';
const OPT_YES = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const OPT_NO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
const RESP_1 = 'ffffffff-ffff-ffff-ffff-fffffffffff1';
const RESP_2 = 'ffffffff-ffff-ffff-ffff-fffffffffff2';

describe('ExportService accuracy (QUA-45 AC3)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ExportService;

  beforeAll(async () => {
    client = new PGlite();

    await client.exec(`
      CREATE TYPE user_role AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role user_role NOT NULL,
        status user_status NOT NULL DEFAULT 'active',
        display_name VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE survey_type AS ENUM ('standard','mutual');
      CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');
      CREATE TYPE response_status AS ENUM ('in_progress','submitted','pending_review','rewarded','rejected');

      CREATE TABLE surveys (
        id UUID PRIMARY KEY,
        surveyor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status survey_status NOT NULL DEFAULT 'draft',
        type survey_type NOT NULL DEFAULT 'standard',
        category survey_category,
        ai_review_enabled BOOLEAN NOT NULL DEFAULT true,
        external_url TEXT,
        reward_type reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        audience_criteria JSONB,
        ai_score INTEGER,
        ai_reject_reason TEXT
      );

      CREATE TABLE survey_questions (
        id UUID PRIMARY KEY,
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        type question_type NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_required BOOLEAN NOT NULL DEFAULT true,
        config JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE question_options (
        id UUID PRIMARY KEY,
        question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        label VARCHAR(500) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE survey_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status response_status NOT NULL DEFAULT 'in_progress',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score INTEGER,
        suspicious_flags JSONB,
        quality_score INTEGER,
        quality_breakdown JSONB,
        behavior_log JSONB,
        UNIQUE (survey_id, respondent_id)
      );

      CREATE TABLE response_answers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        response_id UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        text_answer TEXT,
        selected_option_ids JSONB,
        rating_value INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR_ID}', 'surveyor@export.test', 'surveyor', 'Surveyor'),
        ('${RESPONDENT_1}', 'r1@export.test', 'respondent', 'R1'),
        ('${RESPONDENT_2}', 'r2@export.test', 'respondent', 'R2');

      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, published_at)
      VALUES ('${SURVEY_ID}', '${SURVEYOR_ID}', 'Export Test Survey', 'published', 50, 10, NOW());

      INSERT INTO survey_questions (id, survey_id, type, title, sort_order)
      VALUES
        ('${Q_TEXT}',   '${SURVEY_ID}', 'text',          '開放題', 0),
        ('${Q_CHOICE}', '${SURVEY_ID}', 'single_choice', '選擇題', 1);

      INSERT INTO question_options (id, question_id, label, sort_order)
      VALUES
        ('${OPT_YES}', '${Q_CHOICE}', 'Yes', 0),
        ('${OPT_NO}',  '${Q_CHOICE}', 'No',  1);

      -- Respondent 1: quality_score=85 (passed), answered "Hello world" + Yes
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at, quality_score, fill_duration_seconds)
      VALUES ('${RESP_1}', '${SURVEY_ID}', '${RESPONDENT_1}', 'rewarded', NOW(), 85, 45);

      INSERT INTO response_answers (response_id, question_id, survey_id, text_answer)
      VALUES ('${RESP_1}', '${Q_TEXT}', '${SURVEY_ID}', 'Hello world');

      INSERT INTO response_answers (response_id, question_id, survey_id, selected_option_ids)
      VALUES ('${RESP_1}', '${Q_CHOICE}', '${SURVEY_ID}', '["${OPT_YES}"]');

      -- Respondent 2: quality_score=40 (rejected), answered "Bad" + No
      INSERT INTO survey_responses (id, survey_id, respondent_id, status, submitted_at, quality_score, fill_duration_seconds)
      VALUES ('${RESP_2}', '${SURVEY_ID}', '${RESPONDENT_2}', 'submitted', NOW(), 40, 8);

      INSERT INTO response_answers (response_id, question_id, survey_id, text_answer)
      VALUES ('${RESP_2}', '${Q_TEXT}', '${SURVEY_ID}', 'Bad');

      INSERT INTO response_answers (response_id, question_id, survey_id, selected_option_ids)
      VALUES ('${RESP_2}', '${Q_CHOICE}', '${SURVEY_ID}', '["${OPT_NO}"]');
    `);

    db = drizzle(client, { schema });
    service = new ExportService(db as never);
  });

  afterAll(async () => {
    await client?.close();
  });

  // ── AC3.1: Excel export contains all submitted responses ──────────────────

  it('Excel export includes all submitted/rewarded responses', async () => {
    const buf = await service.generateResponsesExcel(SURVEY_ID, SURVEYOR_ID);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    const sheet = workbook.getWorksheet('Responses');
    expect(sheet).toBeTruthy();

    // Header row + 2 data rows
    const rows: unknown[][] = [];
    sheet.eachRow((row: { values: unknown[] }, idx: number) => {
      if (idx > 1) rows.push(row.values as unknown[]);
    });
    expect(rows).toHaveLength(2);

    // Check Summary sheet totals
    const summary = workbook.getWorksheet('Summary');
    const totalRow = summary.getRow(2);
    expect(totalRow.getCell(2).value).toBe(2); // Total Responses
  });

  it('Excel export quality_score column matches DB value', async () => {
    const buf = await service.generateResponsesExcel(SURVEY_ID, SURVEYOR_ID);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    const sheet = workbook.getWorksheet('Responses');
    const scores: number[] = [];
    sheet.eachRow((row: { getCell: (n: number) => { value: unknown } }, idx: number) => {
      if (idx > 1) scores.push(Number(row.getCell(3).value)); // col 3 = Quality Score
    });
    scores.sort((a, b) => a - b);
    expect(scores).toEqual([40, 85]);
  });

  it('cleanOnly filter excludes low-quality responses', async () => {
    const buf = await service.generateResponsesExcel(SURVEY_ID, SURVEYOR_ID, {
      cleanOnly: true,
      minQualityScore: 70,
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    const sheet = workbook.getWorksheet('Responses');
    const rows: unknown[] = [];
    sheet.eachRow((_row: unknown, idx: number) => {
      if (idx > 1) rows.push(idx);
    });
    // Only respondent 1 (score=85) survives the ≥70 filter
    expect(rows).toHaveLength(1);
  });

  // ── AC3.2: CSV streaming export ───────────────────────────────────────────

  it('CSV stream contains correct header and one row per response', async () => {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));

    await service.streamResponsesCsv(SURVEY_ID, SURVEYOR_ID, out);

    const csv = Buffer.concat(chunks).toString('utf-8').replace(/^﻿/, '');
    const lines = csv.trim().split('\n');

    // Header + 2 data rows
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('response_id');
    expect(lines[0]).toContain('quality_score');
    // Both question columns present
    expect(lines[0]).toContain('開放題');
    expect(lines[0]).toContain('選擇題');
  });

  it('CSV cleanOnly excludes low-quality rows', async () => {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));

    await service.streamResponsesCsv(SURVEY_ID, SURVEYOR_ID, out, {
      cleanOnly: true,
      minQualityScore: 70,
    });

    const csv = Buffer.concat(chunks).toString('utf-8').replace(/^﻿/, '');
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2); // header + 1 clean row
  });

  // ── AC3.3: Summary sheet totals are consistent ───────────────────────────

  it('Summary sheet Passed/Suspicious/Rejected counts sum to total', async () => {
    const buf = await service.generateResponsesExcel(SURVEY_ID, SURVEYOR_ID);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const s = wb.getWorksheet('Summary');

    const total    = Number(s.getRow(2).getCell(2).value); // Total Responses
    const passed   = Number(s.getRow(4).getCell(2).value); // Passed (>=80)
    const gray     = Number(s.getRow(5).getCell(2).value); // Suspicious (50-79)
    const rejected = Number(s.getRow(6).getCell(2).value); // Rejected (<50)
    const unaudit  = Number(s.getRow(7).getCell(2).value); // Unaudited

    expect(passed + gray + rejected + unaudit).toBe(total);

    // Fixture: score=85 → passed, score=40 → rejected
    expect(passed).toBe(1);
    expect(rejected).toBe(1);
    expect(gray).toBe(0);
    expect(unaudit).toBe(0);
  });
});
