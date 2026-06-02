import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { eq, and, inArray, desc, gt } from 'drizzle-orm';
import { Writable } from 'stream';
import { once } from 'events';
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
import { toCsvLine } from '../surveys/export/csv-util';

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

    // pdfmake 0.3.8: module exports an already-instantiated singleton with .createPdf()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfMake = require('pdfmake');
    // 用 PDF standard 14 fonts（無中文 — demo 用，prod 需 embed Noto Sans TC .ttf）
    pdfMake.fonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    };

    const docDefinition = {
      info: {
        title: `Survey Report — ${survey.title}`,
        author: 'QuanWen',
        subject: 'Survey Statistics Report',
      },
      content: [
        { text: `Survey Report`, style: 'header' },
        { text: survey.title, style: 'subheader', margin: [0, 0, 0, 4] as [number, number, number, number] },
        survey.description ? { text: survey.description, italics: true, color: '#666', margin: [0, 0, 0, 12] as [number, number, number, number] } : null,
        {
          columns: [
            { text: `Published: ${survey.publishedAt ? new Date(survey.publishedAt).toLocaleDateString('en-US') : '-'}`, fontSize: 9, color: '#666' },
            { text: `Generated: ${new Date().toLocaleString('en-US')}`, fontSize: 9, color: '#666', alignment: 'right' as const },
          ],
          margin: [0, 0, 0, 16] as [number, number, number, number],
        },
        { text: 'Summary', style: 'sectionHeader' },
        {
          columns: [
            { stack: [{ text: 'Responses', color: '#666', fontSize: 9 }, { text: `${stats.total}`, fontSize: 22, bold: true }] },
            { stack: [{ text: 'Target', color: '#666', fontSize: 9 }, { text: `${survey.targetCount}`, fontSize: 22, bold: true, color: '#666' }] },
            { stack: [{ text: 'Reward (NT$)', color: '#666', fontSize: 9 }, { text: `${survey.rewardPoints}`, fontSize: 22, bold: true, color: '#0F2A5C' }] },
            { stack: [{ text: 'Avg Quality', color: '#666', fontSize: 9 }, { text: `${stats.avgQuality ?? '-'}`, fontSize: 22, bold: true, color: '#126b8a' }] },
          ],
          margin: [0, 0, 0, 16] as [number, number, number, number],
        },
        { text: 'Quality Distribution (AI audit)', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', 60, 60, 60, 60],
            body: [
              [{ text: 'Tier', bold: true }, { text: 'Passed (>=80)', bold: true, alignment: 'right' as const }, { text: 'Suspicious (50-79)', bold: true, alignment: 'right' as const }, { text: 'Rejected (<50)', bold: true, alignment: 'right' as const }, { text: 'Unaudited', bold: true, alignment: 'right' as const }],
              [{ text: 'Count' }, { text: `${stats.passed}`, alignment: 'right' as const }, { text: `${stats.suspicious}`, alignment: 'right' as const }, { text: `${stats.rejected}`, alignment: 'right' as const }, { text: `${stats.unaudited}`, alignment: 'right' as const }],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 16] as [number, number, number, number],
        },
        { text: 'Question Breakdown', style: 'sectionHeader' },
        ...stats.questionStats.map((q, i) => ({
          stack: [
            { text: `Q${i + 1} [${q.type}]: ${q.title}`, bold: true, margin: [0, 6, 0, 4] as [number, number, number, number] },
            q.type === 'single_choice' || q.type === 'multiple_choice'
              ? {
                  table: {
                    widths: ['*', 50],
                    body: [
                      [{ text: 'Option', bold: true }, { text: 'Count', bold: true, alignment: 'right' as const }],
                      ...q.optionCounts.map((o) => [{ text: o.label }, { text: `${o.count}`, alignment: 'right' as const }]),
                    ],
                  },
                  layout: 'lightHorizontalLines',
                }
              : q.type === 'rating'
              ? { text: `Average: ${q.avgRating?.toFixed(2) ?? '-'}  /  Responses: ${q.responseCount}`, color: '#444' }
              : { text: `Open text — ${q.responseCount} responses`, color: '#444' },
          ],
        })),
        { text: 'Note: This is an AI-generated summary. Detailed raw responses available via Excel export.', fontSize: 8, italics: true, color: '#999', margin: [0, 20, 0, 0] as [number, number, number, number] },
      ].filter(Boolean),
      styles: {
        header: { fontSize: 20, bold: true, color: '#0F2A5C' },
        subheader: { fontSize: 14, bold: true },
        sectionHeader: { fontSize: 11, bold: true, color: '#126b8a', margin: [0, 8, 0, 6] as [number, number, number, number] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    };

    // pdfmake 0.3.8: createPdf(doc) → OutputDocumentServer with async getBuffer()
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        if (q.type === 'text') row.push(a.textAnswer ?? '');
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
      const optionCounts = qOptions.map((o) => {
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
      return {
        questionId: q.id,
        type: q.type,
        title: q.title,
        responseCount: qAnswers.length,
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
          TEXT_TYPES.has(questions[i].type) ? redactPii(c) : c,
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

    const minScore = exportOpts.minQualityScore ?? 70;
    const TEXT_TYPES = new Set<string>(['text', 'matrix']);

    // 動態 require 避免 boot 時若未安裝立刻爆
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
          TEXT_TYPES.has(questions[i].type) ? redactPii(c) : c,
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

      cursor = batch[batch.length - 1].id;
      if (batch.length < BATCH) break;
    }

    sheet.commit();
    await workbook.commit();
  }
}
