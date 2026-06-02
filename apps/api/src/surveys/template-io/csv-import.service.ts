import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { SurveyImportService, type ImportResult } from './survey-import.service';

/**
 * Phase 2.1: CSV 問卷匯入服務
 *
 * 支援從 Google Sheets 匯出的 CSV 或手動建立的 CSV 檔案。
 * CSV 格式與 Excel 模板 Questions sheet 同結構：
 *   sortOrder,type,title,description,isRequired,config_json,option_1,...,option_20
 */

const VALID_QUESTION_TYPES = [
  'single_choice', 'multiple_choice', 'text', 'rating', 'matrix',
] as const;

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(private readonly importer: SurveyImportService) {}

  async importFromCsv(userId: string, buffer: Buffer): Promise<ImportResult> {
    const raw = buffer.toString('utf-8');
    const rows = this.parseCsv(raw);

    if (rows.length < 2) {
      throw new BadRequestException('CSV 至少需要標題列 + 1 列題目資料');
    }

    const header = rows[0].map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
    const dataRows = rows.slice(1);

    // 偵測是否含 survey metadata 欄位
    const hasSurveyMeta = header.some(h => /^(title|description|category)$/.test(h) && !header.includes('sortorder'));

    if (hasSurveyMeta) {
      return this.importMixedFormat(userId, rows[0], dataRows);
    }
    return this.importQuestionsOnly(userId, rows[0], dataRows);
  }

  // ── 純題目格式 ──
  private async importQuestionsOnly(
    userId: string,
    header: string[],
    dataRows: string[][],
  ): Promise<ImportResult> {
    const questions = this.parseQuestions(header, dataRows);

    const v1Payload = {
      $schema: 'quanwen.survey.v1' as const,
      exportedAt: new Date().toISOString(),
      platform: { name: 'CSV Import', version: '1.0' },
      survey: {
        title: '(CSV 匯入) 未命名問卷',
        type: 'standard' as const,
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 100,
        aiReviewEnabled: true,
        questions,
      },
    };

    return this.importer.importFromJson(userId, v1Payload);
  }

  // ── 混合格式（第一列 metadata + 後續列題目）──
  private async importMixedFormat(
    userId: string,
    header: string[],
    dataRows: string[][],
  ): Promise<ImportResult> {
    const normalized = header.map(h => h.toLowerCase().trim());
    const idx = (name: string) => normalized.indexOf(name);

    const metaRow = dataRows[0] ?? [];
    const surveyMeta: Record<string, unknown> = {};

    const metaFields = [
      'title', 'description', 'type', 'category',
      'isanonymous', 'rewardpoints', 'targetcount', 'aireviewenabled',
      'externalurl', 'expiresat',
    ];

    for (const field of metaFields) {
      const i = idx(field);
      if (i >= 0 && metaRow[i]) {
        let val: unknown = metaRow[i];
        if (['isanonymous', 'aireviewenabled'].includes(field)) {
          val = val === 'true' || val === '1';
        }
        if (['rewardpoints', 'targetcount'].includes(field)) {
          val = parseInt(val as string, 10) || 0;
        }
        surveyMeta[field] = val;
      }
    }

    const questionRows = dataRows.slice(1);
    const questions = this.parseQuestions(header, questionRows);

    const v1Payload = {
      $schema: 'quanwen.survey.v1' as const,
      exportedAt: new Date().toISOString(),
      platform: { name: 'CSV Import', version: '1.0' },
      survey: {
        title: (surveyMeta.title as string) ?? '(CSV 匯入) 未命名問卷',
        description: (surveyMeta.description as string) ?? null,
        type: (surveyMeta.type as string) ?? 'standard',
        category: (surveyMeta.category as string) ?? null,
        isAnonymous: (surveyMeta.isanonymous as boolean) ?? true,
        rewardPoints: (surveyMeta.rewardpoints as number) ?? 0,
        targetCount: (surveyMeta.targetcount as number) ?? 100,
        aiReviewEnabled: (surveyMeta.aireviewenabled as boolean) ?? true,
        externalUrl: (surveyMeta.externalurl as string) ?? null,
        expiresAt: (surveyMeta.expiresat as string) ?? null,
        questions,
      },
    };

    return this.importer.importFromJson(userId, v1Payload);
  }

  // ── 題目解析 ──
  private parseQuestions(header: string[], rows: string[][]): any[] {
    const normalized = header.map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
    const idx = (name: string) => normalized.indexOf(name);

    const sortOrderIdx = idx('sortorder');
    const typeIdx = idx('type');
    const titleIdx = idx('title');
    const descIdx = idx('description');
    const requiredIdx = idx('isrequired');
    const configIdx = idx('configjson');

    const optionIndices: number[] = [];
    for (let n = 1; n <= 20; n++) {
      const i = idx(`option${n}`);
      if (i >= 0) optionIndices.push(i);
    }

    const questions: any[] = [];

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(cell => !cell?.trim())) continue;

      const sortOrder = sortOrderIdx >= 0 ? parseInt(row[sortOrderIdx] ?? '0', 10) : r;
      const type = (typeIdx >= 0 ? row[typeIdx]?.trim() : 'text') || 'text';
      const title = titleIdx >= 0 ? row[titleIdx]?.trim() : '';
      if (!title) continue;

      const description = descIdx >= 0 ? row[descIdx]?.trim() : undefined;
      const isRequired = requiredIdx >= 0
        ? (row[requiredIdx]?.trim().toLowerCase() === 'true' || row[requiredIdx]?.trim() === '1')
        : false;

      let config = {};
      if (configIdx >= 0 && row[configIdx]?.trim()) {
        try { config = JSON.parse(row[configIdx]); } catch { /* keep empty */ }
      }

      const options = optionIndices
        .map(i => row[i]?.trim())
        .filter(Boolean)
        .map((label, i) => ({ label: label!, sortOrder: i }));

      questions.push({
        sortOrder,
        type: VALID_QUESTION_TYPES.includes(type as any) ? type : 'text',
        title,
        description: description || undefined,
        isRequired,
        config,
        options: options.length > 0 ? options : undefined,
      });
    }

    return questions;
  }

  // ── RFC 4180 CSV parser ──
  private parseCsv(text: string): string[][] {
    const records = parseCsvSync(text.replace(/^\uFEFF/, ''), {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];

    return records.filter((row) => row.some((cell) => cell?.trim()));
  }
}
