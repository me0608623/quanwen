import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ImportResult, SurveyImportService } from './survey-import.service';

const { pdfParseMock } = vi.hoisted(() => ({
  pdfParseMock: vi.fn(),
}));
vi.mock('pdf-parse', () => ({
  default: pdfParseMock,
}));

import { PdfImportService } from './pdf-import.service';

function makeMockImporter() {
  const calls: Array<{ userId: string; raw: unknown }> = [];
  const importer = {
    async importFromJson(userId: string, raw: unknown): Promise<ImportResult> {
      calls.push({ userId, raw });
      const payload = raw as { survey: { questions: unknown[] } };
      return {
        id: 'pdf-survey-id',
        status: 'draft',
        questionsCount: payload.survey.questions.length,
        warnings: [],
      };
    },
  } as unknown as SurveyImportService;
  return { importer, calls };
}

describe('PdfImportService', () => {
  beforeEach(() => {
    pdfParseMock.mockReset();
  });

  it('會把 PDF 文字解析成題目後交給 importer', async () => {
    pdfParseMock.mockResolvedValue({
      text: [
        '產品滿意度調查',
        '請根據經驗回答以下問題',
        '1. 你最常使用哪個平台？',
        'A. iOS',
        'B. Android',
        '2. 你會推薦給朋友嗎？',
        '1) 1',
        '2) 2',
        '3) 3',
        '4) 4',
        '5) 5',
      ].join('\n'),
    });

    const mock = makeMockImporter();
    const svc = new PdfImportService(mock.importer);
    const result = await svc.importFromPdf('user-1', Buffer.from('fake-pdf'));

    expect(result.questionsCount).toBe(2);
    const v1 = mock.calls[0].raw as { survey: { title: string; questions: Array<Record<string, unknown>> } };
    expect(v1.survey.title).toBe('產品滿意度調查');
    expect(v1.survey.questions[0].type).toBe('single_choice');
    expect(v1.survey.questions[1].type).toBe('rating');
    expect(v1.survey.questions[1].config).toEqual({ max: 5 });
  });

  it('pdf-parse 失敗時會丟結構化錯誤', async () => {
    pdfParseMock.mockRejectedValue(new Error('broken pdf'));
    const mock = makeMockImporter();
    const svc = new PdfImportService(mock.importer);

    await expect(svc.importFromPdf('user-1', Buffer.from('bad-pdf'))).rejects.toBeInstanceOf(BadRequestException);
  });
});
