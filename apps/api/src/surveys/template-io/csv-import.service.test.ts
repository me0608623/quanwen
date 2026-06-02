import { describe, it, expect } from 'vitest';
import { CsvImportService } from './csv-import.service';
import type { ImportResult, SurveyImportService } from './survey-import.service';

function makeMockImporter() {
  const calls: Array<{ userId: string; raw: unknown }> = [];
  const importer = {
    async importFromJson(userId: string, raw: unknown): Promise<ImportResult> {
      calls.push({ userId, raw });
      const payload = raw as { survey: { questions: unknown[] } };
      return {
        id: 'csv-survey-id',
        status: 'draft',
        questionsCount: payload.survey.questions.length,
        warnings: [],
      };
    },
  } as unknown as SurveyImportService;

  return { importer, calls };
}

describe('CsvImportService', () => {
  it('questions-only CSV 會轉成 v1 並保留題目/選項', async () => {
    const mock = makeMockImporter();
    const svc = new CsvImportService(mock.importer);
    const csv = [
      'sortOrder,type,title,description,isRequired,config_json,option_1,option_2',
      '0,single_choice,"最愛語言, 可複選嗎？",desc,true,"{}",TypeScript,Python',
      '1,text,補充,,false,"{""multiline"":true}"',
    ].join('\n');

    const result = await svc.importFromCsv('user-1', Buffer.from(csv));

    expect(result.questionsCount).toBe(2);
    expect(mock.calls).toHaveLength(1);
    const v1 = mock.calls[0].raw as { survey: { title: string; questions: Array<Record<string, unknown>> } };
    expect(v1.survey.title).toBe('(CSV 匯入) 未命名問卷');
    expect(v1.survey.questions[0].title).toBe('最愛語言, 可複選嗎？');
    expect(v1.survey.questions[0].options).toEqual([
      { label: 'TypeScript', sortOrder: 0 },
      { label: 'Python', sortOrder: 1 },
    ]);
    expect(v1.survey.questions[1].config).toEqual({ multiline: true });
  });

  it('資料列不足時會拒絕匯入', async () => {
    const mock = makeMockImporter();
    const svc = new CsvImportService(mock.importer);

    await expect(svc.importFromCsv('user-2', Buffer.from('sortOrder,type,title\n'))).rejects.toThrow(
      /至少需要標題列 \+ 1 列題目資料/,
    );
    expect(mock.calls).toHaveLength(0);
  });
});
