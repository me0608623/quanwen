/**
 * Phase 1 + 1.5 — 問卷模板匯入/匯出整合測試
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md
 *
 * 覆蓋:
 *  1. exportAsJson:回傳結構符合 v1 schema,且剝掉個資/執行期欄位
 *  2. importFromJson:export → import round-trip,新問卷的題目/選項/audience 與原始一致
 *  3. importFromJson:跨環境 tagId 失效 → 丟棄並 push warning,不擋整份匯入
 *  4. parseV1:畸形輸入(缺欄位、題目超過 50)→ ok:false + issues 列表
 *  5. importFromJson:畸形 JSON → BadRequestException
 *  6. Excel:generate 樣板 → parser 解回來 → 含 5 個示範題型
 *  7. Excel parser:壞題型 → ExcelParseError(422 details 對應)
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { BadRequestException } from '@nestjs/common';
import { LOGIC_RULES_DDL } from '../../test-helpers/pglite-ddl';

import * as schema from '../../db/schema';
import type { AppDb } from '../../db';
import { SurveysService } from '../surveys.service';
import { SurveyExportService } from './survey-export.service';
import { SurveyImportService } from './survey-import.service';
import { ExcelTemplateService } from './excel-template.service';
import { ExcelImportService } from './excel-import.service';
import { parseV1, V1_SCHEMA_TAG, type QuanWenSurveyV1 } from './quanwen-survey-v1.schema';

const USER1 = '11111111-1111-1111-1111-111111111111';
const USER2 = '22222222-2222-2222-2222-222222222222';

describe('Template IO (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let surveys: SurveysService;
  let exporter: SurveyExportService;
  let importer: SurveyImportService;
  let excelTpl: ExcelTemplateService;
  let excelImp: ExcelImportService;

  beforeAll(async () => {
    client = new PGlite();
    // 最小 schema 子集(只開測試要的表)
    await client.exec(`
      CREATE TYPE user_role   AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role          user_role NOT NULL,
        status        user_status NOT NULL DEFAULT 'active',
        display_name  VARCHAR(100) NOT NULL,
        avatar_url    TEXT,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        password_reset_token VARCHAR(128),
        password_reset_expires_at TIMESTAMPTZ,
        email_verification_token VARCHAR(128),
        email_verification_expires_at TIMESTAMPTZ,
        role_selected_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
      );

      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE question_type AS ENUM ('single_choice','multiple_choice','text','rating','matrix');
      CREATE TYPE survey_type AS ENUM ('standard','mutual');
      CREATE TYPE survey_category AS ENUM ('consumer','academic','wellness','workplace','lifestyle','tech','social','education','finance','other');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title         VARCHAR(200) NOT NULL,
        description   TEXT,
        status        survey_status NOT NULL DEFAULT 'draft',
        type          survey_type NOT NULL DEFAULT 'standard',
        category      survey_category,
        ai_review_enabled BOOLEAN NOT NULL DEFAULT true,
        external_url  TEXT,
        reward_type   reward_type NOT NULL DEFAULT 'cash',
        reward_points INTEGER NOT NULL DEFAULT 0,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        audience_criteria JSONB,
        target_count  INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        expires_at    TIMESTAMPTZ,
        ai_score      INTEGER,
        ai_reject_reason TEXT,
        question_shuffle_mode VARCHAR(16) NOT NULL DEFAULT 'none',
        is_anonymous  BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at  TIMESTAMPTZ
      );
      CREATE TABLE survey_questions (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        type                  question_type NOT NULL,
        title                 TEXT NOT NULL,
        description           TEXT,
        sort_order            INTEGER NOT NULL DEFAULT 0,
        is_required           BOOLEAN NOT NULL DEFAULT true,
        config                JSONB,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE question_options (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
        label       VARCHAR(300) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TYPE tag_category AS ENUM ('tech','lifestyle','finance','health','entertainment','food','travel','education','society','other');
      CREATE TABLE interest_tags (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(50) NOT NULL UNIQUE,
        category    tag_category NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE mutual_pairs (
        id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status    VARCHAR(20) NOT NULL,
        a_user_id UUID NOT NULL,
        a_survey_id UUID NOT NULL,
        b_user_id UUID,
        b_survey_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.exec(LOGIC_RULES_DDL);

    db = drizzle(client, { schema }) as unknown as AppDb;

    // 兩個 user(問卷主 + 第二人,用來驗證跨權限)
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${USER1}', 'u1@quanwen.test', 'surveyor', 'User One'),
        ('${USER2}', 'u2@quanwen.test', 'surveyor', 'User Two');
    `);

    // 真實 SurveysService — 其依賴(zai/aiAudit/wallet)在這個測試用空殼即可,
    // 因為 create() / findOneDetailed() 都不會觸發它們。
    surveys = new SurveysService(
      db,
      {} as never, // ZaiClient
      {} as never, // AiAuditService
      {} as never, // WalletService
    );
    exporter = new SurveyExportService(surveys);
    importer = new SurveyImportService(db, surveys);
    excelTpl = new ExcelTemplateService();
    excelImp = new ExcelImportService(importer);
  });

  beforeEach(async () => {
    await client.exec(
      'DELETE FROM question_options; DELETE FROM survey_questions; DELETE FROM surveys; DELETE FROM interest_tags;',
    );
  });

  // ─── 1. exportAsJson 結構正確、剝掉執行期欄位 ─────────────────────────────

  it('1. exportAsJson: 回傳 v1 結構且不含 surveyorId/status/aiScore 等', async () => {
    const original = await surveys.create(USER1, {
      title: 'My Survey',
      description: 'desc',
      type: 'standard',
      category: 'consumer',
      isAnonymous: true,
      rewardPoints: 10,
      targetCount: 50,
      aiReviewEnabled: true,
      questions: [
        { type: 'single_choice', title: 'Q1', sortOrder: 0, isRequired: true, options: [{ label: 'A', sortOrder: 0 }, { label: 'B', sortOrder: 1 }] },
        { type: 'rating', title: 'Q2', sortOrder: 1, isRequired: false, config: { max: 5 } },
      ],
    });

    const json = await exporter.exportAsJson(original.id, USER1);

    expect(json.$schema).toBe(V1_SCHEMA_TAG);
    expect(json.platform.name).toBe('quanwen');
    expect(json.survey.title).toBe('My Survey');
    expect(json.survey.questions).toHaveLength(2);
    expect(json.survey.questions[0].type).toBe('single_choice');
    expect(json.survey.questions[0].options).toHaveLength(2);
    expect(json.survey.questions[1].type).toBe('rating');
    expect(json.survey.questions[1].config).toEqual({ max: 5 });

    // 不可攜欄位不應在 JSON 裡
    const flat = JSON.stringify(json);
    expect(flat).not.toMatch(/surveyorId/);
    expect(flat).not.toMatch(/aiScore/);
    expect(flat).not.toMatch(/completedCount/);
  });

  // ─── 2. Round-trip:export → import → 題目/選項一致 ───────────────────────

  it('2. round-trip: import 出來的新問卷與原本題目/選項一致', async () => {
    const original = await surveys.create(USER1, {
      title: 'RT Survey',
      type: 'standard',
      category: 'tech',
      isAnonymous: false,
      rewardPoints: 20,
      targetCount: 100,
      aiReviewEnabled: true,
      questions: [
        { type: 'multiple_choice', title: 'M1', sortOrder: 0, isRequired: true, options: [
          { label: 'X', sortOrder: 0 }, { label: 'Y', sortOrder: 1 }, { label: 'Z', sortOrder: 2 },
        ] },
        { type: 'text', title: 'T1', sortOrder: 1, isRequired: false, config: { multiline: true, maxLength: 500 } },
      ],
    });

    const exported = await exporter.exportAsJson(original.id, USER1);
    const result = await importer.importFromJson(USER2, exported);

    expect(result.id).toBeDefined();
    expect(result.id).not.toBe(original.id); // 新問卷 id
    expect(result.status).toBe('draft');     // 一律落 draft
    expect(result.questionsCount).toBe(2);
    expect(result.warnings).toEqual([]);

    const reloaded = await surveys.findOneDetailed(result.id, USER2);
    expect(reloaded.title).toBe('RT Survey');
    expect(reloaded.category).toBe('tech');
    expect(reloaded.isAnonymous).toBe(false);
    expect(reloaded.rewardPoints).toBe(20);
    expect(reloaded.questions).toHaveLength(2);
    expect(reloaded.questions[0].type).toBe('multiple_choice');
    expect(reloaded.questions[0].options).toHaveLength(3);
    expect(reloaded.questions[1].type).toBe('text');
    expect(reloaded.questions[1].config).toEqual({ multiline: true, maxLength: 500 });
  });

  // ─── 3. 跨環境 tagId 失效 → 丟棄 + warning ────────────────────────────────

  it('3. import: requiredTagIds 找不到的 UUID 被丟棄並產生 warning', async () => {
    const validTagId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await client.exec(`
      INSERT INTO interest_tags (id, name, category, sort_order)
      VALUES ('${validTagId}', 'tag-valid', 'tech', 0);
    `);
    const fakeTagId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    const json: QuanWenSurveyV1 = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'test' },
      survey: {
        title: 'tag test',
        type: 'standard',
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 10,
        aiReviewEnabled: true,
        audienceCriteria: { requiredTagIds: [validTagId, fakeTagId], tagMatchMode: 'any' },
        questions: [],
      },
    };

    const result = await importer.importFromJson(USER1, json);
    expect(result.warnings.some((w) => w.includes('tag'))).toBe(true);

    const reloaded = await surveys.findOneDetailed(result.id, USER1);
    const audience = reloaded.audienceCriteria as { requiredTagIds: string[] };
    expect(audience.requiredTagIds).toEqual([validTagId]); // 假 id 被剝掉
  });

  // ─── 4. parseV1 錯誤路徑 ─────────────────────────────────────────────────

  it('4. parseV1: 空物件 → ok:false + 列出缺失欄位', () => {
    const r = parseV1({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.length).toBeGreaterThan(0);
      expect(r.issues.some((i) => i.path.includes('$schema') || i.path === '$schema')).toBe(true);
    }
  });

  it('4b. parseV1: $schema 錯誤值 → ok:false', () => {
    const r = parseV1({ $schema: 'unknown.schema.v9', exportedAt: '2026-01-01T00:00:00Z', platform: { name: 'x', version: '1' }, survey: { title: 'T', type: 'standard', isAnonymous: true, rewardPoints: 0, targetCount: 1, aiReviewEnabled: true, questions: [] } });
    expect(r.ok).toBe(false);
  });

  // ─── 5. importFromJson 餵壞 JSON → 422 ───────────────────────────────────

  it('5. importFromJson: 畸形 JSON 拋 BadRequestException', async () => {
    await expect(importer.importFromJson(USER1, { not: 'valid' })).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── 6. Excel round-trip:樣板生成 → 解析回來含 5 題型 ─────────────────────

  it('6. ExcelTemplate → parser: 解回來含 5 種題型(範例列)', async () => {
    const buf = await excelTpl.generate();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(0);

    const v1 = await excelImp.parseToV1(buf);
    expect(v1.$schema).toBe(V1_SCHEMA_TAG);
    expect(v1.survey.title).toBe('我的問卷標題');
    expect(v1.survey.type).toBe('standard');
    expect(v1.survey.category).toBe('consumer');

    const types = v1.survey.questions.map((q) => q.type).sort();
    expect(types).toEqual(['matrix', 'multiple_choice', 'rating', 'single_choice', 'text'].sort());
  });

  // ─── 7. Excel parser 錯誤路徑 ────────────────────────────────────────────

  it('7. Excel parser:壞題型欄位 → 422(EXCEL_PARSE_ERROR)', async () => {
    // 拿乾淨樣板 buffer,動到 Questions B2(type)灌入無效值,再解
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.default.Workbook();
    const baseBuf = await excelTpl.generate();
    await wb.xlsx.load(baseBuf as unknown as ArrayBuffer);
    const qSheet = wb.getWorksheet('Questions')!;
    qSheet.getRow(2).getCell(2).value = 'date_picker'; // 不支援的題型
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(excelImp.importFromXlsx(USER1, buf)).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── 8. URL 協議防護：javascript: 必須被 Zod refine 擋掉 ──────────────────

  it('8a. parseV1: externalUrl=javascript:alert(1) → ok:false', () => {
    const base = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'test' },
      survey: {
        title: 'xss test',
        type: 'standard',
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 10,
        aiReviewEnabled: true,
        questions: [],
      },
    };

    const badProto = parseV1({ ...base, survey: { ...base.survey, externalUrl: 'javascript:alert(document.cookie)' } });
    expect(badProto.ok).toBe(false);

    const alsoData = parseV1({ ...base, survey: { ...base.survey, externalUrl: 'data:text/html,<script>alert(1)</script>' } });
    expect(alsoData.ok).toBe(false);
  });

  it('8b. parseV1: externalUrl with https:// passes Zod', () => {
    const base = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'test' },
      survey: {
        title: 'valid url test',
        type: 'standard',
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 10,
        aiReviewEnabled: true,
        questions: [],
        externalUrl: 'https://docs.google.com/forms/d/e/test/viewform',
      },
    };
    const r = parseV1(base);
    expect(r.ok).toBe(true);
  });
});
