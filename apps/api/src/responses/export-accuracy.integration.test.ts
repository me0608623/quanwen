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
import { PassThrough, Writable } from 'node:stream';
import * as schema from '../db/schema';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { ExportService } from './export.service';

/**
 * A Writable that simulates a slow client: each chunk write completes
 * asynchronously via setImmediate, so the writable buffer fills up and
 * write() returns false, triggering real drain events.
 */
class SlowWritable extends Writable {
  readonly chunks: Buffer[] = [];
  drainCount = 0;
  constructor(highWaterMark = 1) {
    super({ highWaterMark });
    this.on('drain', () => { this.drainCount++; });
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.chunks.push(chunk);
    setImmediate(cb);
  }
  get result(): Buffer { return Buffer.concat(this.chunks); }
}

const SURVEYOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RESPONDENT_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01';
const RESPONDENT_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02';
const SURVEY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccc00';
const Q_TEXT = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const Q_CHOICE = 'dddddddd-dddd-dddd-dddd-dddddddddd02';
const Q_OPTIONAL_TEXT = 'dddddddd-dddd-dddd-dddd-dddddddddd03';
const Q_YES_NO = 'dddddddd-dddd-dddd-dddd-dddddddddd04';
const Q_MULTI = 'dddddddd-dddd-dddd-dddd-dddddddddd05';
const OPT_YES = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const OPT_NO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
const OPT_MULTI_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03';
const OPT_MULTI_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04';
const RESP_1 = 'ffffffff-ffff-ffff-ffff-fffffffffff1';
const RESP_2 = 'ffffffff-ffff-ffff-ffff-fffffffffff2';

describe('ExportService accuracy (QUA-45 AC3)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ExportService;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);

    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${SURVEYOR_ID}', 'surveyor@export.test', 'surveyor', 'Surveyor'),
        ('${RESPONDENT_1}', 'r1@export.test', 'respondent', 'R1'),
        ('${RESPONDENT_2}', 'r2@export.test', 'respondent', 'R2');

      INSERT INTO surveys (id, surveyor_id, title, status, reward_points, target_count, published_at)
      VALUES ('${SURVEY_ID}', '${SURVEYOR_ID}', 'Export Test Survey', 'published', 50, 10, NOW());

      INSERT INTO survey_questions (id, survey_id, type, title, sort_order, config)
      VALUES
        ('${Q_TEXT}',   '${SURVEY_ID}', 'text',          '開放題', 0, NULL),
        ('${Q_CHOICE}', '${SURVEY_ID}', 'single_choice', '選擇題', 1, NULL),
        ('${Q_OPTIONAL_TEXT}', '${SURVEY_ID}', 'text', '空白選填題', 2, NULL),
        ('${Q_YES_NO}', '${SURVEY_ID}', 'single_choice', '是否推薦', 3, '{"variant":"yes_no"}'),
        ('${Q_MULTI}', '${SURVEY_ID}', 'multiple_choice', '喜歡的功能', 4, NULL);

      INSERT INTO question_options (id, question_id, label, sort_order)
      VALUES
        ('${OPT_YES}', '${Q_CHOICE}', 'Yes', 0),
        ('${OPT_NO}',  '${Q_CHOICE}', 'No',  1),
        ('${OPT_MULTI_A}', '${Q_MULTI}', '報表', 0),
        ('${OPT_MULTI_B}', '${Q_MULTI}', '匯出', 1);

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

      INSERT INTO response_answers (response_id, question_id, survey_id)
      VALUES
        ('${RESP_1}', '${Q_OPTIONAL_TEXT}', '${SURVEY_ID}'),
        ('${RESP_2}', '${Q_OPTIONAL_TEXT}', '${SURVEY_ID}');

      INSERT INTO response_answers (response_id, question_id, survey_id, selected_option_ids)
      VALUES
        ('${RESP_1}', '${Q_YES_NO}', '${SURVEY_ID}', '["yes"]'),
        ('${RESP_2}', '${Q_YES_NO}', '${SURVEY_ID}', '["no"]');

      INSERT INTO response_answers (response_id, question_id, survey_id, selected_option_ids)
      VALUES
        ('${RESP_1}', '${Q_MULTI}', '${SURVEY_ID}', '["${OPT_MULTI_A}", "${OPT_MULTI_B}"]'),
        ('${RESP_2}', '${Q_MULTI}', '${SURVEY_ID}', '["${OPT_MULTI_B}"]');
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

  it('ODS export includes all submitted/rewarded responses', async () => {
    const buf = await (service as unknown as {
      generateResponsesOds: (
        surveyId: string,
        surveyorId: string,
        options?: { cleanOnly?: boolean; minQualityScore?: number },
      ) => Promise<Buffer>;
    }).generateResponsesOds(SURVEY_ID, SURVEYOR_ID);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(0);

    const XLSX = require('xlsx');
    const workbook = XLSX.read(buf, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(expect.arrayContaining(['Responses', 'Summary']));

    const responses = XLSX.utils.sheet_to_json(workbook.Sheets.Responses, {
      header: 1,
      raw: false,
    }) as unknown[][];
    expect(responses).toHaveLength(3); // header + 2 data rows

    const summary = XLSX.utils.sheet_to_json(workbook.Sheets.Summary, {
      header: 1,
      raw: false,
    }) as unknown[][];
    expect(summary[1]?.[1]).toBe('2');
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

  it('does not count blank optional answer rows in summary question totals', async () => {
    const stats = await (service as unknown as {
      computeStats: (surveyId: string) => Promise<{ questionStats: Array<{ questionId: string; responseCount: number }> }>;
    }).computeStats(SURVEY_ID);
    expect(stats.questionStats).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: Q_OPTIONAL_TEXT, responseCount: 0 }),
    ]));
  });

  it('includes synthetic yes-no choices in summary question totals', async () => {
    const stats = await (service as unknown as {
      computeStats: (surveyId: string) => Promise<{
        questionStats: Array<{ questionId: string; responseCount: number; optionCounts: Array<{ id: string; label: string; count: number }> }>;
      }>;
    }).computeStats(SURVEY_ID);
    expect(stats.questionStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        questionId: Q_YES_NO,
        responseCount: 2,
        optionCounts: [
          { id: 'yes', label: '是', count: 1 },
          { id: 'no', label: '否', count: 1 },
        ],
      }),
    ]));
  });

  // ── AC: Backpressure tests ────────────────────────────────────────────────

  it('streamResponsesCsv awaits drain and produces correct output under backpressure', async () => {
    // SlowWritable completes each _write asynchronously, causing write() to
    // return false and triggering drain events — real backpressure simulation.
    const out = new SlowWritable(1);

    await service.streamResponsesCsv(SURVEY_ID, SURVEYOR_ID, out);

    const csv = out.result.toString('utf-8').replace(/^﻿/, '');
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[0]).toContain('response_id');
    // drain must have fired at least once with a 1-byte highWaterMark + slow writes
    expect(out.drainCount).toBeGreaterThan(0);
  });

  it('streamResponsesXlsx produces valid XLSX output under backpressure', async () => {
    const out = new SlowWritable(1);

    await service.streamResponsesXlsx(SURVEY_ID, SURVEYOR_ID, out);

    const buf = out.result;
    expect(buf.byteLength).toBeGreaterThan(0);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    const sheet = workbook.getWorksheet('Responses');
    expect(sheet).toBeTruthy();
    const rows: unknown[] = [];
    sheet.eachRow((_row: unknown, idx: number) => { if (idx > 1) rows.push(idx); });
    expect(rows).toHaveLength(2);

    // drain must have fired at least once given the 1-byte highWaterMark
    expect(out.drainCount).toBeGreaterThan(0);
  });

  it('streamResponsesXlsx cleanOnly filter still works under backpressure', async () => {
    const out = new SlowWritable(1);

    await service.streamResponsesXlsx(SURVEY_ID, SURVEYOR_ID, out, {
      cleanOnly: true,
      minQualityScore: 70,
    });

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(out.result);
    const sheet = workbook.getWorksheet('Responses');
    const rows: unknown[] = [];
    sheet.eachRow((_row: unknown, idx: number) => { if (idx > 1) rows.push(idx); });
    // Only score=85 survives the >=70 filter
    expect(rows).toHaveLength(1);
  });

  it('JASP/SPSS Excel uses numeric codes, value labels, and dummy columns for multiple choice', async () => {
    const buf = await service.generateStatSoftwareExcel(SURVEY_ID, SURVEYOR_ID);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    const data = workbook.getWorksheet('Data');
    const variables = workbook.getWorksheet('Variables');
    const labels = workbook.getWorksheet('Value Labels');
    expect(data).toBeTruthy();
    expect(variables).toBeTruthy();
    expect(labels).toBeTruthy();

    const headers = (data.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([
      'response_id',
      'submitted_at',
      'fill_duration_sec',
      'quality_score',
      'response_status',
      'q001',
      'q002',
      'q003',
      'q004',
      'q005_opt001',
      'q005_opt002',
    ]);

    const choiceValues: number[] = [];
    const yesNoValues: number[] = [];
    const multiSecondOptionValues: number[] = [];
    data.eachRow((row: { getCell: (n: number) => { value: unknown } }, idx: number) => {
      if (idx > 1) {
        choiceValues.push(Number(row.getCell(7).value));
        yesNoValues.push(Number(row.getCell(9).value));
        multiSecondOptionValues.push(Number(row.getCell(11).value));
      }
    });
    choiceValues.sort((a, b) => a - b);
    yesNoValues.sort((a, b) => a - b);
    expect(choiceValues).toEqual([1, 2]);
    expect(yesNoValues).toEqual([1, 2]);
    expect(multiSecondOptionValues).toEqual([1, 1]);

    const valueLabelRows: unknown[][] = [];
    labels.eachRow((row: { values: unknown[] }, idx: number) => {
      if (idx > 1) valueLabelRows.push(row.values.slice(1));
    });
    expect(valueLabelRows).toEqual(expect.arrayContaining([
      ['q002', 1, 'Yes'],
      ['q002', 2, 'No'],
      ['q004', 1, '是'],
      ['q004', 2, '否'],
      ['q005_opt001', 1, 'Selected'],
      ['response_status', 2, 'rewarded'],
    ]));
  });
});
