import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as pdfParseModule from 'pdf-parse';
import { V1_SCHEMA_TAG, type QuanWenSurveyV1 } from './quanwen-survey-v1.schema';
import { SurveyImportService, type ImportResult } from './survey-import.service';

/**
 * PDF 問卷匯入服務
 *
 * 解析上傳的 PDF 檔案，嘗試從中提取問卷結構。
 * 支援的 PDF 格式：
 *   1. 表格式問卷（題號 + 題目 + 選項以表格排列）
 *   2. 純文字問卷（題號 + 題目 + 選項逐行列出）
 *   3. 帶有標記符號的問卷（☐/○/□/● 等表示選項）
 *
 * 解析策略：
 *   - 先提取文字內容
 *   - 以正則辨識題目（阿拉伯數字、中文數字編號）
 *   - 以符號/縮排辨識選項
 *   - 根據選項結構推斷題型（單選/多選/簡答/評分）
 */

const VALID_QUESTION_TYPES = [
  'single_choice', 'multiple_choice', 'text', 'rating',
] as const;

interface ParsedQuestion {
  index: number;
  title: string;
  type: string;
  options: string[];
}

type PdfParseFn = (buffer: Buffer) => Promise<{ text: string }>;

const pdfParse = ((pdfParseModule as unknown as { default?: PdfParseFn }).default ??
  (pdfParseModule as unknown as PdfParseFn));

@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);

  constructor(private readonly importer: SurveyImportService) {}

  async importFromPdf(userId: string, buffer: Buffer): Promise<ImportResult> {
    let text: string;
    try {
      const data = await pdfParse(buffer);
      text = data.text;
    } catch (err) {
      throw new BadRequestException({
        error: {
          code: 'PDF_PARSE_ERROR',
          message: `PDF 解析失敗: ${(err as Error).message}`,
        },
      });
    }

    if (!text || text.trim().length < 10) {
      throw new BadRequestException(
        'PDF 內容為空或文字過少，無法解析問卷結構。請確認 PDF 包含可選取的文字內容（掃描圖片無法解析）。',
      );
    }

    const questions = this.extractQuestions(text);

    if (questions.length === 0) {
      throw new BadRequestException(
        '無法從 PDF 中辨識出任何問卷題目。請確認 PDF 格式為題目+選項結構（支援阿拉伯數字/中文數字編號）。',
      );
    }

    // 組建 v1 payload
    const v1: QuanWenSurveyV1 = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'pdf-import' },
      survey: {
        title: this.extractTitle(text) || '(PDF 匯入) 未命名問卷',
        description: this.extractDescription(text) || undefined,
        type: 'standard',
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 100,
        aiReviewEnabled: true,
        questions: questions.map((q, i) => {
          const question: any = {
            type: q.type,
            title: q.title,
            sortOrder: i,
            isRequired: true,
            config: {},
          };

          if (q.options.length > 0) {
            question.options = q.options.map((label, oi) => ({
              label,
              sortOrder: oi,
            }));
          }

          // Rating 題需加 config.max
          if (q.type === 'rating') {
            question.config = { max: Math.min(q.options.length || 5, 10) };
          }

          return question;
        }),
      },
    };

    return this.importer.importFromJson(userId, v1);
  }

  // ─── 文字解析 ─────────────────────────────────────────────────────────────

  /**
   * 從 PDF 文字中提取題目結構
   *
   * 辨識模式：
   * 1. 「1. 題目」或「1、題目」或「一、題目」
   * 2. 題目後跟選項行（以 A./B./①/□/○ 等開頭）
   * 3. 無選項的視為 text 題
   * 4. 含 1-5/1-10 連續數字選項的視為 rating
   */
  private extractQuestions(text: string): ParsedQuestion[] {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const questions: ParsedQuestion[] = [];
    let currentQuestion: ParsedQuestion | null = null;

    // 題號正則：支援 1. / 1、/ 1） / (1) / 一、/ 壹、/ Q1 / Q.1 / 第1題
    const questionRegex = /^((?:\d+[\.\、\)\）]|[\(（]\d+[\)）]|Q\.?\s*\d+|第\s*\d+\s*題|[一二三四五六七八九十百]+[\、\.)）])\s*)(.*)/;

    // 選項正則：A. / A、/ (A) / ① / □ / ○ / ● / 1)/2) 等
    const optionRegex = /^((?:[A-Z][\.\、\)\）]|[\(（][A-Z][\)）]|[①②③④⑤⑥⑦⑧⑨⑩]|[□☐◉○●◇◆◇◆]|\d+[\)\）])\s*)(.*)/;

    for (const line of lines) {
      const qMatch = line.match(questionRegex);
      const oMatch = line.match(optionRegex);

      if (qMatch && !oMatch) {
        // 儲存上一題
        if (currentQuestion) {
          currentQuestion = this.finalizeQuestion(currentQuestion);
          if (currentQuestion.title) {
            questions.push(currentQuestion);
          }
        }
        currentQuestion = {
          index: questions.length,
          title: qMatch[2].trim(),
          type: 'text',
          options: [],
        };
      } else if (currentQuestion && oMatch) {
        // 選項
        const optionText = oMatch[2].trim();
        if (optionText) {
          currentQuestion.options.push(optionText);
        }
      } else if (currentQuestion && !qMatch) {
        // 可能是題目的續行（合併到 title）或是非結構化文字（跳過）
        // 只在 title 很短且此行不像頁首/頁尾時才合併
        if (currentQuestion.title.length < 20 && line.length > 2 && line.length < 200) {
          // 檢查是否像是題目續行（不像是頁碼/頁首）
          if (!/^\d+$/.test(line) && !/^(第\s*\d+\s*頁|page\s*\d+)/i.test(line)) {
            // 不合併，保持原 title — 寧可少抓也不要串錯
          }
        }
      }
    }

    // 別忘了最後一題
    if (currentQuestion) {
      currentQuestion = this.finalizeQuestion(currentQuestion);
      if (currentQuestion.title) {
        questions.push(currentQuestion);
      }
    }

    return questions.slice(0, 50); // 上限 50 題
  }

  /**
   * 根據選項結構推斷題型
   */
  private finalizeQuestion(q: ParsedQuestion): ParsedQuestion {
    if (q.options.length === 0) {
      q.type = 'text';
      return q;
    }

    // 檢查是否為 rating 題（選項為純數字 1-N）
    const allNumeric = q.options.every(
      (o) => /^\d+$/.test(o.trim()) || /^[非常不?滿意同意喜歡喜歡喜歡喜歡]/.test(o),
    );

    // 檢查是否為李克特量表（1-5 或 1-7 連續描述）
    const likertKeywords = ['非常同意', '同意', '普通', '不同意', '非常不同意',
      '非常滿意', '滿意', '不滿意', '非常不滿意',
      '非常喜歡', '喜歡', '不喜歡', '非常不喜歡'];
    const likertCount = q.options.filter((o) =>
      likertKeywords.some((kw) => o.includes(kw)),
    ).length;

    if (likertCount >= 3 || (allNumeric && q.options.length >= 3 && q.options.length <= 10)) {
      q.type = 'rating';
    } else if (q.options.length >= 2) {
      // 預設為 single_choice
      q.type = 'single_choice';
    } else {
      q.type = 'text';
    }

    return q;
  }

  /**
   * 嘗試從 PDF 文字前幾行提取問卷標題
   */
  private extractTitle(text: string): string {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    // 標題通常在前幾行，且不像是題號開頭
    const questionStartRegex = /^(\d+[\.\、\)\）]|[\(（]\d+[\)）]|Q\.?\s*\d+|第\s*\d+\s*題|[一二三四五六七八九十百]+[\、\.)）])/;

    for (const line of lines.slice(0, 5)) {
      if (line.length > 3 && line.length < 200 && !questionStartRegex.test(line)) {
        // 移除可能的頁首標記
        const cleaned = line.replace(/^(問卷|調查|survey)\s*[:：]\s*/i, '').trim();
        if (cleaned.length > 2) return cleaned;
      }
    }
    return '';
  }

  /**
   * 嘗試從標題後提取問卷描述
   */
  private extractDescription(text: string): string | null {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const questionStartRegex = /^(\d+[\.\、\)\）]|[\(（]\d+[\)）]|Q\.?\s*\d+|第\s*\d+\s*題|[一二三四五六七八九十百]+[\、\.)）])/;

    // 找第一個題號前的描述行
    const descLines: string[] = [];
    let foundTitle = false;

    for (const line of lines.slice(0, 10)) {
      if (questionStartRegex.test(line)) break;
      if (line.length > 10 && !/^\d+$/.test(line)) {
        foundTitle = true;
        descLines.push(line);
      }
    }

    // 跳過第一行（標題），其餘作為描述
    if (descLines.length > 1) {
      return descLines.slice(1).join(' ').slice(0, 2000);
    }
    return null;
  }
}
