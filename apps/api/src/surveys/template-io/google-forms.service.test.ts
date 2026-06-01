/**
 * Phase 2 — GoogleFormsImportService 單元測試(mock importer,不碰 DB)
 *
 * 覆蓋:
 *  1. url + html 同時提供 → 422
 *  2. 都沒提供 → 422(service 內部檢查)
 *  3. URL 為 http(非 https)→ 422
 *  4. URL hostname 非白名單(evil.com)→ 422
 *  5. URL hostname 為 IP 字面(127.0.0.1、私網)→ 422
 *  6. URL 為 localhost → 422
 *  7. HTML 路徑 happy path → 呼到 importer.importFromJson + 含 v1 結構
 *  8. HTML 路徑 + 不支援題型 → warnings 列出 + 不擋匯入
 *  9. HTML 路徑 + 全空(只剩不支援題)→ GOOGLE_FORMS_EMPTY 422
 * 10. HTML 路徑 + 不含 FB_PUBLIC_LOAD_DATA_ → GOOGLE_FORMS_PARSE_ERROR 422
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GoogleFormsImportService } from './google-forms.service';
import type { SurveyImportService, ImportResult } from './survey-import.service';

// 建構 mock importer:記錄被呼叫的 v1,回傳預設結果
function makeMockImporter() {
  const calls: Array<{ userId: string; raw: unknown }> = [];
  const importer = {
    async importFromJson(userId: string, raw: unknown): Promise<ImportResult> {
      calls.push({ userId, raw });
      const v1 = raw as { survey: { questions: unknown[] } };
      return {
        id: 'new-survey-id',
        status: 'draft',
        questionsCount: v1.survey.questions.length,
        warnings: [],
      };
    },
  } as unknown as SurveyImportService;
  return { importer, calls };
}

// 把 form data 包成完整 HTML
function htmlOf(formData: unknown): string {
  return `<html><body><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(formData)};</script></body></html>`;
}

// 標準 form data structure
const radioForm = (title: string) => [
  null,
  ['desc', [
    [1, 'Q1', null, 2, [[null, [['A'], ['B']], null, null, 1]]],
  ], null, null, null, null, null, null, title],
];

describe('GoogleFormsImportService', () => {
  let svc: GoogleFormsImportService;
  let mock: ReturnType<typeof makeMockImporter>;

  beforeEach(() => {
    mock = makeMockImporter();
    svc = new GoogleFormsImportService(mock.importer);
  });

  // ─── input 驗證 ──────────────────────────────────────────────────────────

  it('1. url + html 同時提供 → BadRequest', async () => {
    await expect(
      svc.importFromGoogleForms('u1', { url: 'https://docs.google.com/forms/x', html: '<html/>' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('2. 都沒提供 → BadRequest', async () => {
    await expect(svc.importFromGoogleForms('u1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── SSRF 防護 ───────────────────────────────────────────────────────────

  it('3. URL 為 http → 拒絕', async () => {
    await expect(
      svc.importFromGoogleForms('u1', { url: 'http://docs.google.com/forms/x' }),
    ).rejects.toThrow(/https/);
  });

  it('4. URL hostname 非白名單 → 拒絕', async () => {
    await expect(
      svc.importFromGoogleForms('u1', { url: 'https://evil.com/forms/x' }),
    ).rejects.toThrow(/白名單/);
  });

  it('5. URL hostname 為 IP 字面 → 拒絕', async () => {
    await expect(
      svc.importFromGoogleForms('u1', { url: 'https://127.0.0.1/forms/x' }),
    ).rejects.toThrow(/白名單|IP/);
  });

  it('6. URL 為 localhost → 拒絕', async () => {
    await expect(
      svc.importFromGoogleForms('u1', { url: 'https://localhost/forms/x' }),
    ).rejects.toThrow(/白名單|IP/);
  });

  // ─── HTML 路徑 ────────────────────────────────────────────────────────────

  it('7. HTML happy path → 呼到 importer + 含 v1 結構', async () => {
    const html = htmlOf(radioForm('我的問卷'));
    const result = await svc.importFromGoogleForms('user-1', { html });

    expect(result.id).toBe('new-survey-id');
    expect(result.status).toBe('draft');
    expect(result.questionsCount).toBe(1);
    expect(mock.calls).toHaveLength(1);

    const v1 = mock.calls[0].raw as { $schema: string; survey: { title: string; questions: unknown[] } };
    expect(v1.$schema).toBe('quanwen.survey.v1');
    expect(v1.survey.title).toBe('我的問卷');
    expect(v1.survey.questions).toHaveLength(1);
  });

  it('8. HTML + 不支援題型 → warnings 列出 + 不擋匯入', async () => {
    const mixed = [
      null,
      ['desc', [
        [1, 'OK', null, 2, [[null, [['A'], ['B']], null, null, 1]]],
        [2, '生日', null, 9, [[null, null, null, null, 1]]],
      ], null, null, null, null, null, null, '混合問卷'],
    ];
    const result = await svc.importFromGoogleForms('user-1', { html: htmlOf(mixed) });

    expect(result.questionsCount).toBe(1);
    expect(result.skippedFromSource).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('date'))).toBe(true);
  });

  it('9. 全部不支援 → GOOGLE_FORMS_EMPTY 422', async () => {
    const allDate = [
      null,
      ['desc', [
        [1, 'D1', null, 9, [[null, null, null, null, 1]]],
        [2, 'F1', null, 13, [[null, null, null, null, 1]]],
      ], null, null, null, null, null, null, 'date-only'],
    ];
    await expect(svc.importFromGoogleForms('u1', { html: htmlOf(allDate) }))
      .rejects.toMatchObject({ response: { error: { code: 'GOOGLE_FORMS_EMPTY' } } });
  });

  it('10. HTML 不含 FB_PUBLIC_LOAD_DATA_ → GOOGLE_FORMS_PARSE_ERROR', async () => {
    await expect(svc.importFromGoogleForms('u1', { html: '<html>random page</html>' }))
      .rejects.toMatchObject({ response: { error: { code: 'GOOGLE_FORMS_PARSE_ERROR' } } });
  });
});
