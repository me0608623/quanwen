import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { eq, and, inArray, desc, gt } from 'drizzle-orm';
import type { Writable } from 'node:stream';
import { once } from 'node:events';
import * as path from 'node:path';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  surveys,
  surveyQuestions,
  questionOptions,
  surveyResponses,
  responseAnswers,
} from '../db/schema';
import {
  questionHeaders,
  pivotAnswerCells,
  type OptionLabelMap,
} from '../surveys/export/response-pivoter';
import { redactPii } from '../surveys/analysis/anonymizer';
import { looksEncryptedCipher, ENCRYPTED_ANSWER_PLACEHOLDER } from '../common/crypto.service';
import { toCsvLine } from '../surveys/export/csv-util';

const SYNTHETIC_YES_NO_OPTIONS = [
  { id: 'yes', label: '是' },
  { id: 'no', label: '否' },
];

const dynamicImport = new Function(
  'modulePath',
  'return import(modulePath)',
) as (modulePath: string) => Promise<unknown>;

type TabularExportQuestion = {
  id: string;
  type: string;
  title: string;
};

type TabularExportResponse = {
  id: string;
  submittedAt: Date | string | null;
  qualityScore: number | null;
  status: string;
  fillDurationSeconds: number | null;
};

type TabularExportData = {
  questions: TabularExportQuestion[];
  responses: TabularExportResponse[];
  headers: string[];
  rows: Array<Array<string | number>>;
  summaryRows: Array<[string, string | number]>;
};

type StatExportOption = {
  id: string;
  label: string;
  sortOrder: number;
};

type StatExportQuestion = typeof surveyQuestions.$inferSelect & {
  statOptions: StatExportOption[];
};

type StatExportVariable = {
  name: string;
  label: string;
  questionId: string | null;
  questionType: string;
  measure: 'nominal' | 'ordinal' | 'scale' | 'text';
  valueLabels: Array<{ value: number; label: string }>;
};

type StatExportCell = string | number;

const BASE_STAT_VARIABLES: StatExportVariable[] = [
  {
    name: 'response_id',
    label: 'Response ID',
    questionId: null,
    questionType: 'metadata',
    measure: 'text',
    valueLabels: [],
  },
  {
    name: 'submitted_at',
    label: 'Submitted At',
    questionId: null,
    questionType: 'metadata',
    measure: 'text',
    valueLabels: [],
  },
  {
    name: 'fill_duration_sec',
    label: 'Fill Duration (seconds)',
    questionId: null,
    questionType: 'metadata',
    measure: 'scale',
    valueLabels: [],
  },
  {
    name: 'quality_score',
    label: 'Quality Score',
    questionId: null,
    questionType: 'metadata',
    measure: 'scale',
    valueLabels: [],
  },
  {
    name: 'response_status',
    label: 'Response Status',
    questionId: null,
    questionType: 'metadata',
    measure: 'nominal',
    valueLabels: [
      { value: 1, label: 'submitted' },
      { value: 2, label: 'rewarded' },
    ],
  },
];

/**
 * Phase R：問卷資料匯出（PDF stats 報表 + Excel raw responses）
 *
 * 動態 require 兩個套件避免 boot 時若未安裝立刻爆；prod 必裝。
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(@Inject(DB) private readonly db: AppDb) {}

  /** PDF 報表：survey 統計總覽（給問券方下載） */
  async generateStatsPdf(surveyId: string, surveyorId: string): Promise<Buffer> {
    const survey = await this.assertOwnedSurvey(surveyId, surveyorId);
    const stats = await this.computeStats(surveyId);

    // pdfmake 0.3.x: module exports an already-instantiated singleton with .createPdf()
    const pdfMake = require('pdfmake');
    // 嵌入 Noto Sans TC（繁體中文）字型，解決中文亂碼。
    // 字型放 apps/api/assets/fonts；__dirname 在 dist 與 src 下都解析到 apps/api/..
    const fontDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
    pdfMake.fonts = {
      NotoTC: {
        normal: path.join(fontDir, 'NotoSansTC-Regular.ttf'),
        bold: path.join(fontDir, 'NotoSansTC-Bold.ttf'),
        italics: path.join(fontDir, 'NotoSansTC-Regular.ttf'),
        bolditalics: path.join(fontDir, 'NotoSansTC-Bold.ttf'),
      },
    };

    // 水平長條圖（用 pdfmake canvas 繪製，無需外部繪圖庫）
    const BAR_MAX_W = 230;
    type BarItem = { label: string; value: number; color: string };
    const barChart = (items: BarItem[]) => {
      const max = Math.max(1, ...items.map((i) => i.value));
      return {
        table: {
          widths: [140, '*'] as (number | string)[],
          body: items.map((it) => [
            { text: it.label, fontSize: 9, margin: [0, 3, 0, 0] as [number, number, number, number] },
            {
              columns: [
                {
                  width: 'auto' as const,
                  canvas: [
                    { type: 'rect' as const, x: 0, y: 2, w: Math.max(2, (it.value / max) * BAR_MAX_W), h: 11, r: 2, color: it.color },
                  ],
                },
                { width: 'auto' as const, text: ` ${it.value}`, fontSize: 9, bold: true, margin: [5, 2, 0, 0] as [number, number, number, number] },
              ],
            },
          ]),
        },
        layout: 'noBorders',
        margin: [0, 4, 0, 14] as [number, number, number, number],
      };
    };

    const typeLabel: Record<string, string> = {
      single_choice: '單選題',
      multiple_choice: '多選題',
      text: '文字題',
      rating: '評分題',
      matrix: '矩陣題',
    };
    const palette = ['#0F2A5C', '#126b8a', '#0a8f8f', '#f59e0b', '#fb7185', '#a78bfa', '#34d399', '#94a3b8'];

    const docDefinition = {
      info: {
        title: `問卷報表 — ${survey.title}`,
        author: 'QuanWen 券問',
        subject: '問卷統計報表',
      },
      content: [
        { text: '問卷統計報表', style: 'header' },
        { text: survey.title, style: 'subheader', margin: [0, 0, 0, 4] as [number, number, number, number] },
        survey.description ? { text: survey.description, italics: true, color: '#666', margin: [0, 0, 0, 12] as [number, number, number, number] } : null,
        {
          columns: [
            { text: `發布日期：${survey.publishedAt ? new Date(survey.publishedAt).toLocaleDateString('zh-TW') : '-'}`, fontSize: 9, color: '#666' },
            { text: `產出時間：${new Date().toLocaleString('zh-TW')}`, fontSize: 9, color: '#666', alignment: 'right' as const },
          ],
          margin: [0, 0, 0, 16] as [number, number, number, number],
        },
        { text: '總覽', style: 'sectionHeader' },
        {
          columns: [
            { stack: [{ text: '回覆數', color: '#666', fontSize: 9 }, { text: `${stats.total}`, fontSize: 22, bold: true }] },
            { stack: [{ text: '目標份數', color: '#666', fontSize: 9 }, { text: `${survey.targetCount}`, fontSize: 22, bold: true, color: '#666' }] },
            { stack: [{ text: '每份獎勵（NT$）', color: '#666', fontSize: 9 }, { text: `${survey.rewardPoints}`, fontSize: 22, bold: true, color: '#0F2A5C' }] },
            { stack: [{ text: '平均品質分', color: '#666', fontSize: 9 }, { text: `${stats.avgQuality ?? '-'}`, fontSize: 22, bold: true, color: '#126b8a' }] },
          ],
          margin: [0, 0, 0, 16] as [number, number, number, number],
        },
        { text: '品質分布（AI 審核）', style: 'sectionHeader' },
        barChart([
          { label: '通過（≥80）', value: stats.passed, color: '#34d399' },
          { label: '可疑（50–79）', value: stats.suspicious, color: '#f59e0b' },
          { label: '退件（<50）', value: stats.rejected, color: '#fb7185' },
          { label: '未審核', value: stats.unaudited, color: '#94a3b8' },
        ]),
        { text: '題目分析', style: 'sectionHeader' },
        ...stats.questionStats.map((q, i) => ({
          stack: [
            { text: `Q${i + 1}（${typeLabel[q.type] ?? q.type}）：${q.title}`, bold: true, margin: [0, 8, 0, 4] as [number, number, number, number] },
            q.type === 'single_choice' || q.type === 'multiple_choice'
              ? (q.optionCounts.length > 0
                  ? barChart(q.optionCounts.map((o, idx) => ({ label: o.label, value: o.count, color: palette[idx % palette.length] })))
                  : { text: '尚無作答', color: '#999', fontSize: 9 })
              : q.type === 'rating'
              ? { text: `平均評分：${q.avgRating?.toFixed(2) ?? '-'}　/　回覆數：${q.responseCount}`, color: '#444' }
              : { text: `開放文字題 — 共 ${q.responseCount} 則回覆（完整內容請用 Excel 匯出）`, color: '#444' },
          ],
          unbreakable: true,
        })),
        { text: '備註：本報表為統計摘要；完整逐筆回覆請使用 Excel 匯出。', fontSize: 8, italics: true, color: '#999', margin: [0, 20, 0, 0] as [number, number, number, number] },
      ].filter(Boolean),
      styles: {
        header: { fontSize: 20, bold: true, color: '#0F2A5C' },
        subheader: { fontSize: 14, bold: true },
        sectionHeader: { fontSize: 11, bold: true, color: '#126b8a', margin: [0, 10, 0, 6] as [number, number, number, number] },
      },
      defaultStyle: { font: 'NotoTC', fontSize: 10 },
      pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    };

    // pdfmake 0.3.x: createPdf(doc) → OutputDocumentServer with async getBuffer()
    const pdfDoc = pdfMake.createPdf(docDefinition);
    return pdfDoc.getBuffer();
  }

  /** Excel raw responses 匯出（含 quality score + 完整 metadata） */
  async generateResponsesExcel(
    surveyId: string,
    surveyorId: string,
    options: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<Buffer> {
    await this.assertOwnedSurvey(surveyId, surveyorId);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuanWen';
    workbook.created = new Date();

    // ── Sheet 1: Responses ────────────────────────────────────────
    const sheet = workbook.addWorksheet('Responses');

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const options_ = qIds.length > 0
      ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds))
      : [];
    const optionLabelById = this.buildOptionLabelById(options_);
    for (const option of SYNTHETIC_YES_NO_OPTIONS) optionLabelById.set(option.id, option.label);

    let responses = await this.db
      .select()
      .from(surveyResponses)
      .where(and(
        eq(surveyResponses.surveyId, surveyId),
        inArray(surveyResponses.status, ['submitted', 'rewarded']),
      ))
      .orderBy(desc(surveyResponses.submittedAt));

    if (options.cleanOnly) {
      const minScore = options.minQualityScore ?? 70;
      responses = responses.filter((r) => (r.qualityScore ?? 0) >= minScore);
    }

    const respIds = responses.map((r) => r.id);
    const answers = respIds.length > 0
      ? await this.db.select().from(responseAnswers).where(inArray(responseAnswers.responseId, respIds))
      : [];
    const answerByResponseQuestion = this.buildAnswerByResponseQuestion(answers);

    // Header row
    const headers = [
      'Response ID',
      'Submitted At',
      'Quality Score',
      'Status',
      'Fill Duration (s)',
      ...questions.map((q, i) => `Q${i + 1}: ${q.title}`),
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE3F2FD' },
    };

    // Body rows
    for (const r of responses) {
      const row: (string | number)[] = [
        r.id,
        r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
        r.qualityScore ?? '',
        r.status,
        r.fillDurationSeconds ?? '',
      ];
      for (const q of questions) {
        const a = answerByResponseQuestion.get(this.answerKey(r.id, q.id));
        if (!a) { row.push(''); continue; }
        if (q.type === 'text') row.push(a.textAnswer ? (looksEncryptedCipher(a.textAnswer) ? ENCRYPTED_ANSWER_PLACEHOLDER : a.textAnswer) : '');
        else if (q.type === 'rating') row.push(a.ratingValue ?? '');
        else if (q.type === 'single_choice' || q.type === 'multiple_choice') {
          const ids = Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds as string[] : [];
          const labels = ids.map((id) => optionLabelById.get(id) ?? id);
          row.push(labels.join('; '));
        }
        else if (q.type === 'matrix') row.push(a.textAnswer ?? '');  // raw JSON
        else row.push('');
      }
      sheet.addRow(row);
    }

    // Column widths
    sheet.getColumn(1).width = 38;
    sheet.getColumn(2).width = 22;
    sheet.getColumn(3).width = 14;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 16;
    for (let i = 0; i < questions.length; i++) {
      sheet.getColumn(6 + i).width = 30;
    }

    // ── Sheet 2: Summary ──────────────────────────────────────────
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Metric', 'Value']);
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.addRow(['Total Responses', responses.length]);
    summarySheet.addRow(['Avg Quality', responses.length > 0 ? Math.round(responses.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / responses.length) : 0]);
    summarySheet.addRow(['Passed (>=80)', responses.filter((r) => (r.qualityScore ?? 0) >= 80).length]);
    summarySheet.addRow(['Suspicious (50-79)', responses.filter((r) => { const s = r.qualityScore ?? 0; return s >= 50 && s < 80; }).length]);
    summarySheet.addRow(['Rejected (<50)', responses.filter((r) => (r.qualityScore ?? 0) < 50 && r.qualityScore != null).length]);
    summarySheet.addRow(['Unaudited', responses.filter((r) => r.qualityScore == null).length]);
    summarySheet.getColumn(1).width = 24;
    summarySheet.getColumn(2).width = 14;

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ── 組裝匯出矩陣（Responses 表頭/資料列 + Summary 列）；ODS 與其他純資料匯出共用 ──
  private async buildResponsesMatrix(
    surveyId: string,
    options: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<{ headers: (string | number)[]; body: (string | number)[][]; summary: (string | number)[][] }> {
    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const options_ = qIds.length > 0
      ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds))
      : [];
    const optionLabelById = this.buildOptionLabelById(options_);
    for (const option of SYNTHETIC_YES_NO_OPTIONS) optionLabelById.set(option.id, option.label);

    let responses = await this.db
      .select()
      .from(surveyResponses)
      .where(and(
        eq(surveyResponses.surveyId, surveyId),
        inArray(surveyResponses.status, ['submitted', 'rewarded']),
      ))
      .orderBy(desc(surveyResponses.submittedAt));

    if (options.cleanOnly) {
      const minScore = options.minQualityScore ?? 70;
      responses = responses.filter((r) => (r.qualityScore ?? 0) >= minScore);
    }

    const respIds = responses.map((r) => r.id);
    const answers = respIds.length > 0
      ? await this.db.select().from(responseAnswers).where(inArray(responseAnswers.responseId, respIds))
      : [];
    const answerByResponseQuestion = this.buildAnswerByResponseQuestion(answers);

    const headers: (string | number)[] = [
      'Response ID',
      'Submitted At',
      'Quality Score',
      'Status',
      'Fill Duration (s)',
      ...questions.map((q, i) => `Q${i + 1}: ${q.title}`),
    ];

    const body: (string | number)[][] = responses.map((r) => {
      const row: (string | number)[] = [
        r.id,
        r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
        r.qualityScore ?? '',
        r.status,
        r.fillDurationSeconds ?? '',
      ];
      for (const q of questions) {
        const a = answerByResponseQuestion.get(this.answerKey(r.id, q.id));
        if (!a) { row.push(''); continue; }
        if (q.type === 'text') row.push(a.textAnswer ? (looksEncryptedCipher(a.textAnswer) ? ENCRYPTED_ANSWER_PLACEHOLDER : a.textAnswer) : '');
        else if (q.type === 'rating') row.push(a.ratingValue ?? '');
        else if (q.type === 'single_choice' || q.type === 'multiple_choice') {
          const ids = Array.isArray(a.selectedOptionIds) ? a.selectedOptionIds as string[] : [];
          row.push(ids.map((id) => optionLabelById.get(id) ?? id).join('; '));
        }
        else if (q.type === 'matrix') row.push(a.textAnswer ?? '');
        else row.push('');
      }
      return row;
    });

    const summary: (string | number)[][] = [
      ['Total Responses', responses.length],
      ['Avg Quality', responses.length > 0 ? Math.round(responses.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / responses.length) : 0],
      ['Passed (>=80)', responses.filter((r) => (r.qualityScore ?? 0) >= 80).length],
      ['Suspicious (50-79)', responses.filter((r) => { const s = r.qualityScore ?? 0; return s >= 50 && s < 80; }).length],
      ['Rejected (<50)', responses.filter((r) => (r.qualityScore ?? 0) < 50 && r.qualityScore != null).length],
      ['Unaudited', responses.filter((r) => r.qualityScore == null).length],
    ];

    return { headers, body, summary };
  }

  /** OpenDocument Spreadsheet (.ods) 匯出：Responses + Summary 兩張表（透過 SheetJS）。 */
  async generateResponsesOds(
    surveyId: string,
    surveyorId: string,
    options: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<Buffer> {
    await this.assertOwnedSurvey(surveyId, surveyorId);
    const { headers, body, summary } = await this.buildResponsesMatrix(surveyId, options);

    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...body]), 'Responses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...summary]), 'Summary');
    return Buffer.from(XLSX.write(wb, { bookType: 'ods', type: 'buffer' }));
  }

  /**
   * JASP / SPSS 友善 Excel 匯出。
   *
   * 設計重點：
   * - Data 第一列使用穩定、短、ASCII 變數名稱（SPSS 匯入更穩定）。
   * - 單選 / 是非題輸出為 1..N 數值代碼，Value Labels sheet 記錄代碼意義。
   * - 多選題拆成每個選項一欄 0/1 dummy variable，方便 JASP/SPSS 直接做交叉表與迴歸。
   * - 評分題保留數值；文字 / 矩陣題保留字串並在 Variables sheet 標記 measure=text。
   */
  async generateStatSoftwareExcel(
    surveyId: string,
    surveyorId: string,
    options: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<Buffer> {
    const survey = await this.assertOwnedSurvey(surveyId, surveyorId);
    const { questions, responses, answerByResponseQuestion } = await this.getStatExportRows(surveyId, options);
    const variables = this.buildStatVariables(questions);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuanWen';
    workbook.created = new Date();
    workbook.subject = 'JASP/SPSS compatible survey data';

    const dataSheet = workbook.addWorksheet('Data');
    dataSheet.addRow(variables.map((variable) => variable.name));
    dataSheet.getRow(1).font = { bold: true };
    dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const response of responses) {
      const row: StatExportCell[] = [
        response.id,
        response.submittedAt ? new Date(response.submittedAt).toISOString() : '',
        response.fillDurationSeconds ?? '',
        response.qualityScore ?? '',
        response.status === 'rewarded' ? 2 : 1,
      ];

      for (const question of questions) {
        const answer = answerByResponseQuestion.get(this.answerKey(response.id, question.id));
        row.push(...this.statCellsForQuestion(question, answer));
      }

      dataSheet.addRow(row);
    }

    for (const [index, variable] of variables.entries()) {
      const column = dataSheet.getColumn(index + 1);
      column.width = variable.measure === 'text' ? 28 : Math.max(12, variable.name.length + 2);
    }

    const variablesSheet = workbook.addWorksheet('Variables');
    variablesSheet.addRow([
      'variable_name',
      'variable_label',
      'question_id',
      'question_type',
      'measure',
      'missing_values',
      'notes',
    ]);
    variablesSheet.getRow(1).font = { bold: true };
    for (const variable of variables) {
      variablesSheet.addRow([
        variable.name,
        variable.label,
        variable.questionId ?? '',
        variable.questionType,
        variable.measure,
        'blank',
        variable.valueLabels.length > 0 ? 'See Value Labels sheet' : '',
      ]);
    }
    variablesSheet.columns = [
      { width: 24 },
      { width: 44 },
      { width: 38 },
      { width: 18 },
      { width: 12 },
      { width: 16 },
      { width: 28 },
    ];

    const valueLabelsSheet = workbook.addWorksheet('Value Labels');
    valueLabelsSheet.addRow(['variable_name', 'value', 'label']);
    valueLabelsSheet.getRow(1).font = { bold: true };
    for (const variable of variables) {
      for (const valueLabel of variable.valueLabels) {
        valueLabelsSheet.addRow([variable.name, valueLabel.value, valueLabel.label]);
      }
    }
    valueLabelsSheet.columns = [{ width: 24 }, { width: 10 }, { width: 40 }];

    const guideSheet = workbook.addWorksheet('Import Guide');
    guideSheet.addRows([
      ['QuanWen JASP/SPSS 匯入格式'],
      ['問卷', survey.title],
      ['匯出時間', new Date().toISOString()],
      [],
      ['JASP', 'Open → Computer → Browse → 選擇此 .xlsx，使用 Data 工作表。'],
      ['SPSS', 'File → Import Data → Excel，勾選 Read variable names from the first row，使用 Data 工作表。'],
      ['變數說明', 'Variables 工作表記錄題目、題型與量尺；Value Labels 工作表記錄數值代碼。'],
      ['多選題', '每個選項拆成 0/1 欄位，1=有勾選，0=未勾選。'],
      ['缺漏值', '空白代表沒有作答或未審核。'],
    ]);
    guideSheet.getRow(1).font = { bold: true };
    guideSheet.columns = [{ width: 18 }, { width: 90 }];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private async assertOwnedSurvey(surveyId: string, surveyorId: string) {
    const rows = await this.db.select().from(surveys).where(eq(surveys.id, surveyId)).limit(1);
    const s = rows[0];
    if (!s) throw new NotFoundException('問卷不存在');
    if (s.surveyorId !== surveyorId) throw new ForbiddenException('無權存取');
    return s;
  }

  private async computeStats(surveyId: string) {
    const questions = await this.db.select().from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId)).orderBy(surveyQuestions.sortOrder);
    const qIds = questions.map((q) => q.id);
    const opts = qIds.length > 0 ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds)) : [];
    const responses = await this.db
      .select()
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, surveyId), inArray(surveyResponses.status, ['submitted', 'rewarded'])));
    const respIds = responses.map((r) => r.id);
    const answers = respIds.length > 0 ? await this.db.select().from(responseAnswers).where(inArray(responseAnswers.responseId, respIds)) : [];
    const answersByQuestion = this.groupAnswersByQuestion(answers);
    const optionsByQuestion = this.groupOptionsByQuestion(opts);

    const audited = responses.filter((r) => r.qualityScore != null);
    const avgQuality = audited.length > 0 ? Math.round(audited.reduce((s, r) => s + (r.qualityScore ?? 0), 0) / audited.length) : null;

    const questionStats = questions.map((q) => {
      const qAnswers = answersByQuestion.get(q.id) ?? [];
      const qOptions = optionsByQuestion.get(q.id) ?? [];
      const config = typeof q.config === 'object' && q.config !== null && !Array.isArray(q.config)
        ? q.config as Record<string, unknown>
        : {};
      const statOptions = q.type === 'single_choice' && config.variant === 'yes_no'
        ? SYNTHETIC_YES_NO_OPTIONS
        : qOptions;
      const optionCounts = statOptions.map((o) => {
        let count = 0;
        for (const answer of qAnswers) {
          if (Array.isArray(answer.selectedOptionIds) && (answer.selectedOptionIds as string[]).includes(o.id)) {
            count += 1;
          }
        }
        return { id: o.id, label: o.label, count };
      });
      const ratingValues = qAnswers.filter((a) => a.ratingValue != null).map((a) => a.ratingValue!);
      const avgRating = ratingValues.length > 0 ? ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length : null;
      const responseCount = q.type === 'rating'
        ? ratingValues.length
        : q.type === 'single_choice' || q.type === 'multiple_choice'
          ? qAnswers.filter((answer) => Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.length > 0).length
          : qAnswers.filter((answer) => typeof answer.textAnswer === 'string' && answer.textAnswer.trim().length > 0).length;
      return {
        questionId: q.id,
        type: q.type,
        title: q.title,
        responseCount,
        optionCounts,
        avgRating,
      };
    });

    return {
      total: responses.length,
      passed: responses.filter((r) => (r.qualityScore ?? 0) >= 80).length,
      suspicious: responses.filter((r) => { const s = r.qualityScore ?? 0; return s >= 50 && s < 80; }).length,
      rejected: responses.filter((r) => (r.qualityScore ?? 0) < 50 && r.qualityScore != null).length,
      unaudited: responses.filter((r) => r.qualityScore == null).length,
      avgQuality,
      questionStats,
    };
  }

  private answerKey(responseId: string, questionId: string): string {
    return `${responseId}:${questionId}`;
  }

  private buildAnswerByResponseQuestion(
    answers: Array<typeof responseAnswers.$inferSelect>,
  ): Map<string, typeof responseAnswers.$inferSelect> {
    const map = new Map<string, typeof responseAnswers.$inferSelect>();
    for (const answer of answers) {
      map.set(this.answerKey(answer.responseId, answer.questionId), answer);
    }
    return map;
  }

  private buildOptionLabelById(
    options: Array<typeof questionOptions.$inferSelect>,
  ): Map<string, string> {
    return new Map(options.map((option) => [option.id, option.label]));
  }

  private async getStatExportRows(
    surveyId: string,
    options: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<{
    questions: StatExportQuestion[];
    responses: TabularExportResponse[];
    answerByResponseQuestion: Map<string, typeof responseAnswers.$inferSelect>;
  }> {
    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const optionRows = qIds.length > 0
      ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds)).orderBy(questionOptions.sortOrder)
      : [];
    const optionsByQuestion = this.groupOptionsByQuestion(optionRows);
    const statQuestions = questions.map((question): StatExportQuestion => ({
      ...question,
      statOptions: this.statOptionsForQuestion(question, optionsByQuestion.get(question.id) ?? []),
    }));

    let responses = await this.db
      .select({
        id: surveyResponses.id,
        submittedAt: surveyResponses.submittedAt,
        qualityScore: surveyResponses.qualityScore,
        status: surveyResponses.status,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
      })
      .from(surveyResponses)
      .where(and(
        eq(surveyResponses.surveyId, surveyId),
        inArray(surveyResponses.status, ['submitted', 'rewarded']),
      ))
      .orderBy(desc(surveyResponses.submittedAt));

    if (options.cleanOnly) {
      const minScore = options.minQualityScore ?? 70;
      responses = responses.filter((response) => (response.qualityScore ?? 0) >= minScore);
    }

    const responseIds = responses.map((response) => response.id);
    const answers = responseIds.length > 0
      ? await this.db.select().from(responseAnswers).where(inArray(responseAnswers.responseId, responseIds))
      : [];

    return {
      questions: statQuestions,
      responses,
      answerByResponseQuestion: this.buildAnswerByResponseQuestion(answers),
    };
  }

  private statOptionsForQuestion(
    question: typeof surveyQuestions.$inferSelect,
    options: Array<typeof questionOptions.$inferSelect>,
  ): StatExportOption[] {
    const config = this.recordFromUnknown(question.config);
    if (question.type === 'single_choice' && config.variant === 'yes_no') {
      return SYNTHETIC_YES_NO_OPTIONS.map((option, index) => ({ ...option, sortOrder: index }));
    }
    return options.map((option) => ({
      id: option.id,
      label: option.label,
      sortOrder: option.sortOrder,
    }));
  }

  private buildStatVariables(questions: StatExportQuestion[]): StatExportVariable[] {
    const variables = [...BASE_STAT_VARIABLES];

    questions.forEach((question, questionIndex) => {
      const qNumber = questionIndex + 1;
      if (question.type === 'multiple_choice') {
        question.statOptions.forEach((option, optionIndex) => {
          variables.push({
            name: this.statVariableName(qNumber, optionIndex + 1),
            label: `Q${qNumber}: ${question.title} — ${option.label}`,
            questionId: question.id,
            questionType: question.type,
            measure: 'nominal',
            valueLabels: [
              { value: 0, label: 'Not selected' },
              { value: 1, label: 'Selected' },
            ],
          });
        });
        return;
      }

      variables.push({
        name: this.statVariableName(qNumber),
        label: `Q${qNumber}: ${question.title}`,
        questionId: question.id,
        questionType: question.type,
        measure: this.measureForQuestion(question.type),
        valueLabels: this.valueLabelsForQuestion(question),
      });
    });

    return variables;
  }

  private statCellsForQuestion(
    question: StatExportQuestion,
    answer: typeof responseAnswers.$inferSelect | undefined,
  ): StatExportCell[] {
    if (!answer) {
      return question.type === 'multiple_choice'
        ? question.statOptions.map(() => 0)
        : [''];
    }

    if (question.type === 'single_choice') {
      const selectedId = this.stringArrayFromUnknown(answer.selectedOptionIds)[0];
      return [this.optionCode(question, selectedId) ?? ''];
    }

    if (question.type === 'multiple_choice') {
      const selectedIds = new Set(this.stringArrayFromUnknown(answer.selectedOptionIds));
      return question.statOptions.map((option) => selectedIds.has(option.id) ? 1 : 0);
    }

    if (question.type === 'rating') {
      return [answer.ratingValue ?? ''];
    }

    const text = answer.textAnswer ?? '';
    return [looksEncryptedCipher(text) ? ENCRYPTED_ANSWER_PLACEHOLDER : text];
  }

  private statVariableName(questionNumber: number, optionNumber?: number): string {
    const q = String(questionNumber).padStart(3, '0');
    if (optionNumber == null) return `q${q}`;
    return `q${q}_opt${String(optionNumber).padStart(3, '0')}`;
  }

  private measureForQuestion(questionType: string): StatExportVariable['measure'] {
    if (questionType === 'single_choice') return 'nominal';
    if (questionType === 'rating') return 'scale';
    if (questionType === 'text' || questionType === 'matrix') return 'text';
    return 'nominal';
  }

  private valueLabelsForQuestion(question: StatExportQuestion): Array<{ value: number; label: string }> {
    if (question.type === 'single_choice') {
      return question.statOptions.map((option, index) => ({
        value: index + 1,
        label: option.label,
      }));
    }

    if (question.type === 'rating') {
      const config = this.recordFromUnknown(question.config);
      const maxRating = typeof config.max_rating === 'number' && Number.isFinite(config.max_rating)
        ? Math.max(1, Math.floor(config.max_rating))
        : 5;
      return Array.from({ length: maxRating }, (_value, index) => ({
        value: index + 1,
        label: String(index + 1),
      }));
    }

    return [];
  }

  private optionCode(question: StatExportQuestion, optionId: string | undefined): number | null {
    if (!optionId) return null;
    const index = question.statOptions.findIndex((option) => option.id === optionId);
    return index >= 0 ? index + 1 : null;
  }

  private stringArrayFromUnknown(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private recordFromUnknown(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  private groupAnswersByQuestion(
    answers: Array<typeof responseAnswers.$inferSelect>,
  ): Map<string, Array<typeof responseAnswers.$inferSelect>> {
    const grouped = new Map<string, Array<typeof responseAnswers.$inferSelect>>();
    for (const answer of answers) {
      const bucket = grouped.get(answer.questionId);
      if (bucket) bucket.push(answer);
      else grouped.set(answer.questionId, [answer]);
    }
    return grouped;
  }

  private groupOptionsByQuestion(
    options: Array<typeof questionOptions.$inferSelect>,
  ): Map<string, Array<typeof questionOptions.$inferSelect>> {
    const grouped = new Map<string, Array<typeof questionOptions.$inferSelect>>();
    for (const option of options) {
      const bucket = grouped.get(option.questionId);
      if (bucket) bucket.push(option);
      else grouped.set(option.questionId, [option]);
    }
    return grouped;
  }

  /**
   * 串流匯出填答 CSV（批次 keyset → pivot → 去識別化 → 防注入 → 寫入 res）。
   * 不全量載入，數千份填答記憶體恆定。見「問卷資料儲存與規模化設計.md §5.2」。
   */
  async streamResponsesCsv(
    surveyId: string,
    surveyorId: string,
    out: Writable,
    exportOpts: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<void> {
    await this.assertOwnedSurvey(surveyId, surveyorId);

    const questions = await this.db
      .select({ id: surveyQuestions.id, type: surveyQuestions.type, title: surveyQuestions.title })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const optionRows = qIds.length
      ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds))
      : [];
    const optionLabels: OptionLabelMap = {};
    for (const o of optionRows) optionLabels[o.id] = o.label;
    for (const option of SYNTHETIC_YES_NO_OPTIONS) optionLabels[option.id] = option.label;

    const minScore = exportOpts.minQualityScore ?? 70;
    const TEXT_TYPES = new Set<string>(['text', 'matrix']);

    const write = async (chunk: string): Promise<void> => {
      if (!out.write(chunk)) await once(out, 'drain');
    };

    // UTF-8 BOM 讓 Excel 正確辨識中文
    await write('﻿');
    await write(
      toCsvLine([
        'response_id',
        'submitted_at',
        'fill_duration_sec',
        'quality_score',
        ...questionHeaders(questions),
      ]) + '\n',
    );

    const BATCH = 500;
    let cursor: string | null = null;
    for (;;) {
      const base = and(
        eq(surveyResponses.surveyId, surveyId),
        inArray(surveyResponses.status, ['submitted', 'rewarded']),
      );
      const batch = await this.db
        .select({
          id: surveyResponses.id,
          submittedAt: surveyResponses.submittedAt,
          fillDurationSeconds: surveyResponses.fillDurationSeconds,
          qualityScore: surveyResponses.qualityScore,
        })
        .from(surveyResponses)
        .where(cursor ? and(base, gt(surveyResponses.id, cursor)) : base)
        .orderBy(surveyResponses.id)
        .limit(BATCH);
      if (batch.length === 0) break;

      const ids = batch.map((r) => r.id);
      const answers = await this.db
        .select()
        .from(responseAnswers)
        .where(inArray(responseAnswers.responseId, ids));
      const byResp = new Map<string, typeof answers>();
      for (const a of answers) {
        const arr = byResp.get(a.responseId) ?? [];
        arr.push(a);
        byResp.set(a.responseId, arr);
      }

      for (const r of batch) {
        if (exportOpts.cleanOnly && (r.qualityScore ?? 0) < minScore) continue;
        const pivotAnswers = (byResp.get(r.id) ?? []).map((a) => ({
          questionId: a.questionId,
          textAnswer: a.textAnswer,
          selectedOptionIds: (a.selectedOptionIds as string[] | null) ?? null,
          ratingValue: a.ratingValue,
        }));
        const cells = pivotAnswerCells(questions, pivotAnswers, optionLabels).map((c, i) =>
          TEXT_TYPES.has(questions[i].type)
            ? (looksEncryptedCipher(c) ? ENCRYPTED_ANSWER_PLACEHOLDER : redactPii(c))
            : c,
        );
        await write(
          toCsvLine([
            r.id,
            r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
            r.fillDurationSeconds ?? '',
            r.qualityScore ?? '',
            ...cells,
          ]) + '\n',
        );
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }

    out.end();
  }

  /**
   * 串流匯出 Markdown 報告：聚合摘要（總覽 + 逐題分析）。
   * 不揭露 AI 模型名;文字樣本已在 computeStats 階段去識別化前不夾原始 PII（樣本來自答案文字，由匯出層的 redactPii 守住）。
   */
  async streamResponsesMarkdown(
    surveyId: string,
    surveyorId: string,
    out: Writable,
  ): Promise<void> {
    const survey = await this.assertOwnedSurvey(surveyId, surveyorId);
    const stats = await this.computeStats(surveyId);

    const lines: string[] = [];
    lines.push(`# ${survey.title} — 問卷分析報告`);
    lines.push('');
    lines.push(`匯出時間：${new Date().toISOString()}`);
    lines.push('');
    lines.push('## 總覽');
    lines.push('');
    lines.push('| 指標 | 數量 |');
    lines.push('| ---- | ----: |');
    lines.push(`| 總填答 | ${stats.total} |`);
    lines.push(`| 通過（≥80） | ${stats.passed} |`);
    lines.push(`| 灰區（50–79） | ${stats.suspicious} |`);
    lines.push(`| 退件（<50） | ${stats.rejected} |`);
    lines.push(`| 未審核 | ${stats.unaudited} |`);
    lines.push(`| 平均品質分 | ${stats.avgQuality ?? '—'} |`);
    lines.push('');
    lines.push('## 逐題分析');
    for (const q of stats.questionStats) {
      lines.push('');
      lines.push(`### ${q.title}`);
      lines.push('');
      lines.push(`類型：\`${q.type}\`　回應數：${q.responseCount}`);
      if (q.optionCounts.length > 0) {
        lines.push('');
        lines.push('| 選項 | 計數 |');
        lines.push('| ---- | ----: |');
        for (const o of q.optionCounts) lines.push(`| ${o.label} | ${o.count} |`);
      }
      if (q.avgRating != null) {
        lines.push('');
        lines.push(`平均評分：**${q.avgRating.toFixed(2)}**`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push('註：本報告由 AI 數據分析產生；填答者個資已遮蔽。');

    if (!out.write(lines.join('\n'))) await once(out, 'drain');
    out.end();
  }

  /**
   * 串流匯出 Excel（exceljs streaming WorkbookWriter）。
   * 與 CSV 相同的批次 keyset + pivot + 去識別化模式；每列 commit 後落地，記憶體恆定。
   */
  async streamResponsesXlsx(
    surveyId: string,
    surveyorId: string,
    out: Writable,
    exportOpts: { cleanOnly?: boolean; minQualityScore?: number } = {},
  ): Promise<void> {
    await this.assertOwnedSurvey(surveyId, surveyorId);

    const questions = await this.db
      .select({ id: surveyQuestions.id, type: surveyQuestions.type, title: surveyQuestions.title })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const optionRows = qIds.length
      ? await this.db.select().from(questionOptions).where(inArray(questionOptions.questionId, qIds))
      : [];
    const optionLabels: OptionLabelMap = {};
    for (const o of optionRows) optionLabels[o.id] = o.label;
    for (const option of SYNTHETIC_YES_NO_OPTIONS) optionLabels[option.id] = option.label;

    const minScore = exportOpts.minQualityScore ?? 70;
    const TEXT_TYPES = new Set<string>(['text', 'matrix']);

    // 動態 require 避免 boot 時若未安裝立刻爆
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: out,
      useSharedStrings: false,
      useStyles: false,
    });
    const sheet = workbook.addWorksheet('Responses');

    const header = [
      'response_id',
      'submitted_at',
      'fill_duration_sec',
      'quality_score',
      ...questionHeaders(questions),
    ];
    sheet.addRow(header).commit();

    const BATCH = 500;
    let cursor: string | null = null;
    for (;;) {
      const base = and(
        eq(surveyResponses.surveyId, surveyId),
        inArray(surveyResponses.status, ['submitted', 'rewarded']),
      );
      const batch = await this.db
        .select({
          id: surveyResponses.id,
          submittedAt: surveyResponses.submittedAt,
          fillDurationSeconds: surveyResponses.fillDurationSeconds,
          qualityScore: surveyResponses.qualityScore,
        })
        .from(surveyResponses)
        .where(cursor ? and(base, gt(surveyResponses.id, cursor)) : base)
        .orderBy(surveyResponses.id)
        .limit(BATCH);
      if (batch.length === 0) break;

      const ids = batch.map((r) => r.id);
      const answers = await this.db
        .select()
        .from(responseAnswers)
        .where(inArray(responseAnswers.responseId, ids));
      const byResp = new Map<string, typeof answers>();
      for (const a of answers) {
        const arr = byResp.get(a.responseId) ?? [];
        arr.push(a);
        byResp.set(a.responseId, arr);
      }

      for (const r of batch) {
        if (exportOpts.cleanOnly && (r.qualityScore ?? 0) < minScore) continue;
        const pivotAnswers = (byResp.get(r.id) ?? []).map((a) => ({
          questionId: a.questionId,
          textAnswer: a.textAnswer,
          selectedOptionIds: (a.selectedOptionIds as string[] | null) ?? null,
          ratingValue: a.ratingValue,
        }));
        const cells = pivotAnswerCells(questions, pivotAnswers, optionLabels).map((c, i) =>
          TEXT_TYPES.has(questions[i].type)
            ? (looksEncryptedCipher(c) ? ENCRYPTED_ANSWER_PLACEHOLDER : redactPii(c))
            : c,
        );
        sheet
          .addRow([
            r.id,
            r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
            r.fillDurationSeconds ?? '',
            r.qualityScore ?? '',
            ...cells,
          ])
          .commit();
      }

      // Backpressure: after each batch, yield to the event loop so the exceljs
      // internal transform can flush its queued writes to `out`. If `out` still
      // signals it needs to drain (buffer full / slow client), wait until it does
      // before querying and writing the next batch.
      if (out.writableNeedDrain) {
        await once(out, 'drain');
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }

    sheet.commit();
    await workbook.commit();
  }
}
