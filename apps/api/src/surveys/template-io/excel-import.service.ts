import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { read, utils } from 'xlsx';
import { V1_SCHEMA_TAG, type QuanWenSurveyV1 } from './quanwen-survey-v1.schema';
import { SurveyImportService, type ImportResult } from './survey-import.service';

/**
 * Phase 1.5:把上傳的 Excel(QuanWen 樣板)解析成 v1 JSON 結構,
 * 再走 SurveyImportService 同一條路徑落 DB。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md §4
 *
 * 失敗策略:解析錯誤拋結構化 422,details 列出第幾列、第幾欄的問題;
 *           不部分匯入(全有全無)。
 */

interface ParseIssue {
  sheet: string;
  row?: number;
  column?: string;
  message: string;
}

class ExcelParseError extends Error {
  constructor(public readonly issues: ParseIssue[]) {
    super('Excel 解析失敗');
  }
}

const VALID_TYPES = ['standard', 'mutual'] as const;
const VALID_CATEGORIES = [
  'consumer', 'academic', 'wellness', 'workplace', 'lifestyle',
  'tech', 'social', 'education', 'finance', 'other',
] as const;
const VALID_QUESTION_TYPES = [
  'single_choice', 'multiple_choice', 'text', 'rating', 'matrix',
] as const;

type SheetRows = unknown[][];

@Injectable()
export class ExcelImportService {
  private readonly logger = new Logger(ExcelImportService.name);

  constructor(private readonly importer: SurveyImportService) {}

  async importFromXlsx(userId: string, buffer: Buffer): Promise<ImportResult> {
    let v1: QuanWenSurveyV1;
    try {
      v1 = await this.parseToV1(buffer);
    } catch (err) {
      if (err instanceof ExcelParseError) {
        throw new BadRequestException({
          error: {
            code: 'EXCEL_PARSE_ERROR',
            message: 'Excel 解析失敗',
            details: err.issues,
          },
        });
      }
      throw err;
    }
    this.logger.log(`parsed xlsx import: ${v1.survey.questions.length} questions`);
    return this.importer.importFromJson(userId, v1);
  }

  async parseToV1(buffer: Buffer): Promise<QuanWenSurveyV1> {
    const workbook = read(buffer, {
      type: 'buffer',
      cellDates: false,
      raw: false,
      dense: true,
    });

    const issues: ParseIssue[] = [];
    const survey = this.parseSurveySheet(this.getSheetRows(workbook, 'Survey'), issues);
    const questions = this.parseQuestionsSheet(this.getSheetRows(workbook, 'Questions'), issues);
    const audience = this.parseAudienceSheet(this.getSheetRows(workbook, 'Audience'), issues);

    if (issues.length > 0) throw new ExcelParseError(issues);

    return {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'excel-import' },
      survey: {
        ...survey,
        audienceCriteria: audience,
        questions,
      },
    };
  }

  private getSheetRows(workbook: ReturnType<typeof read>, sheetName: string): SheetRows | undefined {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return undefined;
    return utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as SheetRows;
  }

  private parseSurveySheet(
    rows: SheetRows | undefined,
    issues: ParseIssue[],
  ): QuanWenSurveyV1['survey'] {
    if (!rows || rows.length === 0) {
      issues.push({ sheet: 'Survey', message: '缺少 Survey sheet' });
      return this.emptySurvey();
    }

    const headerRow = rows[0] ?? [];
    const dataRow = rows[1] ?? [];
    const get = (key: string): unknown => {
      const idx = this.findHeaderIndex(headerRow, key);
      return idx < 0 ? undefined : dataRow[idx];
    };

    const title = String(get('title') ?? '').trim();
    if (!title) {
      issues.push({ sheet: 'Survey', row: 2, column: 'title', message: 'title 必填' });
    }

    const typeRaw = String(get('type') ?? 'standard').trim();
    if (!VALID_TYPES.includes(typeRaw as typeof VALID_TYPES[number])) {
      issues.push({ sheet: 'Survey', row: 2, column: 'type', message: `type 必須是 ${VALID_TYPES.join('/')}` });
    }

    const categoryRaw = String(get('category') ?? '').trim();
    const category = categoryRaw
      ? VALID_CATEGORIES.includes(categoryRaw as typeof VALID_CATEGORIES[number])
        ? (categoryRaw as typeof VALID_CATEGORIES[number])
        : undefined
      : undefined;
    if (categoryRaw && !category) {
      issues.push({ sheet: 'Survey', row: 2, column: 'category', message: `category 不是有效值;可選 ${VALID_CATEGORIES.join('/')}` });
    }

    return {
      title,
      description: this.optString(get('description')),
      type: (VALID_TYPES.includes(typeRaw as typeof VALID_TYPES[number]) ? typeRaw : 'standard') as 'standard' | 'mutual',
      category,
      isAnonymous: this.bool(get('isAnonymous'), true),
      rewardPoints: this.int(get('rewardPoints'), 0),
      targetCount: this.int(get('targetCount'), 100),
      aiReviewEnabled: this.bool(get('aiReviewEnabled'), true),
      externalUrl: this.optString(get('externalUrl')),
      expiresAt: this.optString(get('expiresAt')),
      audienceCriteria: undefined,
      questions: [],
    };
  }

  private parseQuestionsSheet(
    rows: SheetRows | undefined,
    issues: ParseIssue[],
  ): QuanWenSurveyV1['survey']['questions'] {
    if (!rows || rows.length === 0) {
      issues.push({ sheet: 'Questions', message: '缺少 Questions sheet' });
      return [];
    }

    const headerRow = rows[0] ?? [];
    const result: QuanWenSurveyV1['survey']['questions'] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const excelRowNumber = r + 1;
      if (this.isRowEmpty(row, headerRow)) continue;

      const typeRaw = String(this.getCell(row, headerRow, 'type') ?? '').trim();
      const title = String(this.getCell(row, headerRow, 'title') ?? '').trim();

      if (!title) {
        issues.push({ sheet: 'Questions', row: excelRowNumber, column: 'title', message: '題目 title 必填' });
        continue;
      }
      if (!VALID_QUESTION_TYPES.includes(typeRaw as typeof VALID_QUESTION_TYPES[number])) {
        issues.push({
          sheet: 'Questions',
          row: excelRowNumber,
          column: 'type',
          message: `題型「${typeRaw || '(空)'}」不支援;可選 ${VALID_QUESTION_TYPES.join('/')}`,
        });
        continue;
      }

      const sortOrder = this.int(this.getCell(row, headerRow, 'sortOrder'), result.length);
      const description = this.optString(this.getCell(row, headerRow, 'description'));
      const isRequired = this.bool(this.getCell(row, headerRow, 'isRequired'), true);

      let config: Record<string, unknown> = {};
      const configRaw = this.getCell(row, headerRow, 'config_json');
      if (configRaw !== undefined && configRaw !== null && String(configRaw).trim() !== '') {
        try {
          const parsed = JSON.parse(String(configRaw));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            config = parsed as Record<string, unknown>;
          } else {
            issues.push({ sheet: 'Questions', row: excelRowNumber, column: 'config_json', message: 'config_json 必須是 JSON 物件' });
          }
        } catch {
          issues.push({ sheet: 'Questions', row: excelRowNumber, column: 'config_json', message: 'config_json 不是合法 JSON' });
        }
      }

      const options: Array<{ label: string; sortOrder: number }> = [];
      for (let i = 1; i <= 20; i++) {
        const label = this.optString(this.getCell(row, headerRow, `option_${i}`));
        if (label) options.push({ label, sortOrder: options.length });
      }

      if ((typeRaw === 'single_choice' || typeRaw === 'multiple_choice') && options.length < 2) {
        issues.push({ sheet: 'Questions', row: excelRowNumber, column: 'option_*', message: 'choice 題至少需 2 個選項' });
        continue;
      }
      if (typeRaw === 'rating' && config.max === undefined) {
        issues.push({ sheet: 'Questions', row: excelRowNumber, column: 'config_json', message: 'rating 題的 config 必須含 max' });
        continue;
      }
      if (typeRaw === 'matrix') {
        const configWithAxes = config as { rows?: unknown; cols?: unknown };
        if (!Array.isArray(configWithAxes.rows) || configWithAxes.rows.length === 0 || !Array.isArray(configWithAxes.cols) || configWithAxes.cols.length === 0) {
          issues.push({ sheet: 'Questions', row: excelRowNumber, column: 'config_json', message: 'matrix 題的 config 必須含非空 rows[] 與 cols[]' });
          continue;
        }
      }

      result.push({
        type: typeRaw as 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix',
        title,
        description,
        sortOrder,
        isRequired,
        config,
        options: options.length > 0 ? options : undefined,
      });
    }

    if (result.length > 50) {
      issues.push({ sheet: 'Questions', message: `題目超過上限 50 題(實際 ${result.length})` });
    }

    return [...result]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((q, i) => ({ ...q, sortOrder: i }));
  }

  private parseAudienceSheet(
    rows: SheetRows | undefined,
    issues: ParseIssue[],
  ): QuanWenSurveyV1['survey']['audienceCriteria'] {
    if (!rows || rows.length === 0) return undefined;

    const kv = new Map<string, string>();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const k = String(row[0] ?? '').trim();
      const v = String(row[1] ?? '').trim();
      if (k) kv.set(k, v);
    }

    const csv = (key: string): string[] | undefined => {
      const value = kv.get(key);
      if (!value) return undefined;
      const arr = value.split(',').map((s) => s.trim()).filter(Boolean);
      return arr.length > 0 ? arr : undefined;
    };

    const minRep = kv.get('minReputationScore');
    let minReputationScore: number | undefined;
    if (minRep) {
      const n = Number(minRep);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        issues.push({ sheet: 'Audience', message: 'minReputationScore 必須是 0..100 的整數' });
      } else {
        minReputationScore = n;
      }
    }

    const tagMatchModeRaw = kv.get('tagMatchMode');
    const tagMatchMode: 'any' | 'all' | undefined =
      tagMatchModeRaw === 'any' || tagMatchModeRaw === 'all' ? tagMatchModeRaw : undefined;
    if (tagMatchModeRaw && !tagMatchMode) {
      issues.push({ sheet: 'Audience', message: 'tagMatchMode 必須是 any 或 all' });
    }

    const out = {
      ageRange: csv('ageRange'),
      gender: csv('gender'),
      region: csv('region'),
      occupation: csv('occupation'),
      industry: csv('industry'),
      education: csv('education'),
      minReputationScore,
      requiredTagIds: csv('requiredTagIds'),
      tagMatchMode,
    };

    return Object.values(out).some((value) => value !== undefined) ? out : undefined;
  }

  private findHeaderIndex(headerRow: unknown[], name: string): number {
    return headerRow.findIndex((cell) => String(cell ?? '').trim() === name);
  }

  private getCell(row: unknown[], headerRow: unknown[], headerName: string): unknown {
    const idx = this.findHeaderIndex(headerRow, headerName);
    return idx < 0 ? undefined : row[idx];
  }

  private optString(v: unknown): string | undefined {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s ? s : undefined;
  }

  private bool(v: unknown, fallback: boolean): boolean {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
    return fallback;
  }

  private int(v: unknown, fallback: number): number {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  private isRowEmpty(row: unknown[], headerRow: unknown[]): boolean {
    for (let i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i] ?? '').trim() === '') continue;
      if (String(row[i] ?? '').trim() !== '') return false;
    }
    return true;
  }

  private emptySurvey(): QuanWenSurveyV1['survey'] {
    return {
      title: '',
      type: 'standard',
      isAnonymous: true,
      rewardPoints: 0,
      targetCount: 100,
      aiReviewEnabled: true,
      questions: [],
    };
  }
}
