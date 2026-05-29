import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
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
    // 走既有 JSON importer(Zod 二次驗證 + tagId 過濾 + create)
    return this.importer.importFromJson(userId, v1);
  }

  /** 公開供測試:純 parse,不落 DB */
  async parseToV1(buffer: Buffer): Promise<QuanWenSurveyV1> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const issues: ParseIssue[] = [];
    const survey = this.parseSurveySheet(wb, issues);
    const questions = this.parseQuestionsSheet(wb, issues);
    const audience = this.parseAudienceSheet(wb, issues);

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

  // ─── Survey sheet ────────────────────────────────────────────────────────

  private parseSurveySheet(
    wb: ExcelJS.Workbook,
    issues: ParseIssue[],
  ): QuanWenSurveyV1['survey'] {
    const sheet = wb.getWorksheet('Survey');
    if (!sheet) {
      issues.push({ sheet: 'Survey', message: '缺少 Survey sheet' });
      return this.emptySurvey();
    }
    const headerRow = sheet.getRow(1);
    const dataRow = sheet.getRow(2);
    const get = (key: string): unknown => {
      const idx = this.findHeaderIndex(headerRow, key);
      if (idx < 0) return undefined;
      return this.cellValue(dataRow.getCell(idx));
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
      // audienceCriteria / questions 由其他 sheet 補
      audienceCriteria: undefined,
      questions: [],
    };
  }

  // ─── Questions sheet ─────────────────────────────────────────────────────

  private parseQuestionsSheet(
    wb: ExcelJS.Workbook,
    issues: ParseIssue[],
  ): QuanWenSurveyV1['survey']['questions'] {
    const sheet = wb.getWorksheet('Questions');
    if (!sheet) {
      issues.push({ sheet: 'Questions', message: '缺少 Questions sheet' });
      return [];
    }
    const headerRow = sheet.getRow(1);
    const result: QuanWenSurveyV1['survey']['questions'] = [];

    const lastRow = sheet.actualRowCount;
    for (let r = 2; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      // 全空白列跳過
      if (this.isRowEmpty(row, headerRow)) continue;

      const typeRaw = String(this.cellValue(row.getCell(this.findHeaderIndex(headerRow, 'type'))) ?? '').trim();
      const title = String(this.cellValue(row.getCell(this.findHeaderIndex(headerRow, 'title'))) ?? '').trim();

      if (!title) {
        issues.push({ sheet: 'Questions', row: r, column: 'title', message: '題目 title 必填' });
        continue;
      }
      if (!VALID_QUESTION_TYPES.includes(typeRaw as typeof VALID_QUESTION_TYPES[number])) {
        issues.push({
          sheet: 'Questions',
          row: r,
          column: 'type',
          message: `題型「${typeRaw || '(空)'}」不支援;可選 ${VALID_QUESTION_TYPES.join('/')}`,
        });
        continue;
      }

      const sortOrder = this.int(this.cellValue(row.getCell(this.findHeaderIndex(headerRow, 'sortOrder'))), result.length);
      const description = this.optString(this.cellValue(row.getCell(this.findHeaderIndex(headerRow, 'description'))));
      const isRequired = this.bool(this.cellValue(row.getCell(this.findHeaderIndex(headerRow, 'isRequired'))), true);

      // config_json
      let config: Record<string, unknown> = {};
      const configRaw = this.cellValue(row.getCell(this.findHeaderIndex(headerRow, 'config_json')));
      if (configRaw !== undefined && configRaw !== null && String(configRaw).trim() !== '') {
        try {
          const parsed = JSON.parse(String(configRaw));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            config = parsed as Record<string, unknown>;
          } else {
            issues.push({ sheet: 'Questions', row: r, column: 'config_json', message: 'config_json 必須是 JSON 物件' });
          }
        } catch {
          issues.push({ sheet: 'Questions', row: r, column: 'config_json', message: 'config_json 不是合法 JSON' });
        }
      }

      // options
      const options: Array<{ label: string; sortOrder: number }> = [];
      for (let i = 1; i <= 20; i++) {
        const cellVal = this.cellValue(row.getCell(this.findHeaderIndex(headerRow, `option_${i}`)));
        const label = cellVal === undefined || cellVal === null ? '' : String(cellVal).trim();
        if (label) options.push({ label, sortOrder: options.length });
      }

      if ((typeRaw === 'single_choice' || typeRaw === 'multiple_choice') && options.length < 2) {
        issues.push({ sheet: 'Questions', row: r, column: 'option_*', message: 'choice 題至少需 2 個選項' });
        continue;
      }
      if (typeRaw === 'rating' && config.max === undefined) {
        issues.push({ sheet: 'Questions', row: r, column: 'config_json', message: 'rating 題的 config 必須含 max' });
        continue;
      }
      if (typeRaw === 'matrix') {
        const rows = (config as { rows?: unknown }).rows;
        const cols = (config as { cols?: unknown }).cols;
        if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(cols) || cols.length === 0) {
          issues.push({ sheet: 'Questions', row: r, column: 'config_json', message: 'matrix 題的 config 必須含非空 rows[] 與 cols[]' });
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

    // 依 sortOrder 重新排序,並把 sortOrder 重編為連續整數
    return [...result]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((q, i) => ({ ...q, sortOrder: i }));
  }

  // ─── Audience sheet ──────────────────────────────────────────────────────

  private parseAudienceSheet(
    wb: ExcelJS.Workbook,
    issues: ParseIssue[],
  ): QuanWenSurveyV1['survey']['audienceCriteria'] {
    const sheet = wb.getWorksheet('Audience');
    if (!sheet) return undefined; // 受眾 sheet 是可選的(空 = 不限)

    const kv = new Map<string, string>();
    const lastRow = sheet.actualRowCount;
    for (let r = 2; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      const k = String(this.cellValue(row.getCell(1)) ?? '').trim();
      const v = String(this.cellValue(row.getCell(2)) ?? '').trim();
      if (k) kv.set(k, v);
    }

    const csv = (key: string): string[] | undefined => {
      const v = kv.get(key);
      if (!v) return undefined;
      const arr = v.split(',').map((s) => s.trim()).filter(Boolean);
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
    // 全空 → 回 undefined(等於不限)
    const hasAny = Object.values(out).some((v) => v !== undefined);
    return hasAny ? out : undefined;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private findHeaderIndex(headerRow: ExcelJS.Row, name: string): number {
    let found = -1;
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (String(cell.value ?? '').trim() === name && found < 0) found = colNumber;
    });
    return found;
  }

  private cellValue(cell: ExcelJS.Cell | undefined): unknown {
    if (!cell) return undefined;
    const v = cell.value;
    if (v === null || v === undefined) return undefined;
    // exceljs 對含公式的 cell 回 { result, formula }
    if (typeof v === 'object' && 'result' in (v as object)) {
      return (v as { result: unknown }).result;
    }
    // 富文本 → 串接 plain text
    if (typeof v === 'object' && 'richText' in (v as object)) {
      const rt = (v as { richText: Array<{ text: string }> }).richText;
      return rt.map((p) => p.text).join('');
    }
    return v;
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

  private isRowEmpty(row: ExcelJS.Row, headerRow: ExcelJS.Row): boolean {
    let nonEmpty = false;
    headerRow.eachCell({ includeEmpty: false }, (_h, colNumber) => {
      const v = this.cellValue(row.getCell(colNumber));
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        nonEmpty = true;
      }
    });
    return !nonEmpty;
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
