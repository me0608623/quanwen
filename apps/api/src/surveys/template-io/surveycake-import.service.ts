import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { V1_SCHEMA_TAG, type QuanWenSurveyV1 } from './quanwen-survey-v1.schema';
import { SurveyImportService, type ImportResult } from './survey-import.service';
import { parseSurveyCakeNative } from './surveycake-native-parser';

/**
 * SurveyCake 問卷匯入服務
 *
 * 支援兩種匯入方式：
 * 1. 上傳 SurveyCake 匯出的 JSON 檔案
 * 2. 貼上 SurveyCake 分享連結（需為公開問卷）
 *
 * SurveyCake JSON 結構（常見格式）：
 * {
 *   "title": "...",
 *   "description": "...",
 *   "questions": [
 *     {
 *       "subject": "題目",
 *       "type": "radio" | "checkbox" | "text" | "textarea" | "scale" | ...,
 *       "options": ["選項1", "選項2", ...],
 *       "required": true/false
 *     }
 *   ]
 * }
 *
 * 題型對應：
 *   radio       → single_choice
 *   checkbox    → multiple_choice
 *   text/textarea → text
 *   scale       → rating
 *   其他        → text (fallback，列入 warning)
 */

const TYPE_MAP: Record<string, string> = {
  // SurveyCake 題型
  radio: 'single_choice',
  select: 'single_choice',
  dropdown: 'single_choice',
  checkbox: 'multiple_choice',
  check: 'multiple_choice',
  text: 'text',
  textarea: 'text',
  email: 'text',
  number: 'text',
  phone: 'text',
  date: 'text',
  time: 'text',
  scale: 'rating',
  rating: 'rating',
  score: 'rating',
  slider: 'rating',
  // 中文題型名
  單選: 'single_choice',
  多選: 'multiple_choice',
  問答: 'text',
  簡答: 'text',
  評分: 'rating',
  量表: 'rating',
  矩陣: 'text', // QuanWen matrix 需要特殊 config，這裡 fallback
};

const VALID_QUESTION_TYPES = new Set([
  'single_choice', 'multiple_choice', 'text', 'rating',
]);

@Injectable()
export class SurveyCakeImportService {
  private readonly logger = new Logger(SurveyCakeImportService.name);

  constructor(private readonly importer: SurveyImportService) {}

  /**
   * 從 SurveyCake JSON 匯入
   */
  async importFromJson(userId: string, raw: unknown): Promise<ImportResult> {
    if (!raw || typeof raw !== 'object') {
      throw new BadRequestException('SurveyCake JSON 格式錯誤：必須是 JSON 物件');
    }

    const data = raw as Record<string, unknown>;
    const warnings: string[] = [];

    // 嘗試從各種 SurveyCake 格式中提取題目
    const questions = this.extractQuestions(data, warnings);

    if (questions.length === 0) {
      throw new BadRequestException(
        '無法從此 JSON 中辨識 SurveyCake 問卷結構。請確認 JSON 包含 questions 陣列或題目資料。',
      );
    }

    const title = this.extractString(data, ['title', 'name', 'surveyTitle', 'survey_name'])
      || '(SurveyCake 匯入) 未命名問卷';
    const description = this.extractString(data, ['description', 'desc', 'surveyDescription', 'survey_description'])
      || undefined;

    const v1: QuanWenSurveyV1 = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'surveycake-import' },
      survey: {
        title,
        description,
        type: 'standard',
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 100,
        aiReviewEnabled: true,
        questions,
      },
    };

    const result = await this.importer.importFromJson(userId, v1);
    return {
      ...result,
      warnings: [...result.warnings, ...warnings],
    };
  }

  /**
   * 從 SurveyCake 分享連結匯入（嘗試抓取頁面並解析）
   */
  async importFromUrl(userId: string, url: string): Promise<ImportResult> {
    // 驗證 URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('無效的 URL');
    }

    const allowedHosts = ['www.surveycake.com', 'surveycake.com', 'app.surveycake.com'];
    if (!allowedHosts.some((h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
      throw new BadRequestException(
        `不支援的主機: ${parsedUrl.hostname}，僅支援 surveycake.com`,
      );
    }

    // 主路徑:/s/{svid} 填答頁是 SPA,題目 JSON 在固定靜態路徑 s3/json/{svid}.json
    const svidMatch = /^\/s\/([A-Za-z0-9_-]{1,32})\/?$/.exec(parsedUrl.pathname);
    if (svidMatch) {
      const native = await this.tryImportNative(userId, svidMatch[1]);
      if (native) return native;
    }

    // 嘗試 fetch 頁面
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'QuanWen/1.0' },
        redirect: 'follow',
      });
    } catch (err) {
      throw new BadRequestException(
        `無法連線 SurveyCake: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadRequestException(
        `SurveyCake 回應錯誤: HTTP ${response.status}`,
      );
    }

    const html = await response.text();

    // 嘗試從 HTML 中提取 embedded JSON（SurveyCake 通常會在 script 標籤中嵌入問卷資料）
    const jsonData = this.extractJsonFromHtml(html);
    if (jsonData) {
      return this.importFromJson(userId, jsonData);
    }

    // Fallback: 嘗試純 HTML 解析
    throw new BadRequestException(
      '無法從 SurveyCake 頁面中提取問卷資料。建議：從 SurveyCake 匯出 JSON 檔案後直接上傳。',
    );
  }

  /**
   * 從 SurveyCake 靜態 JSON(s3/json/{svid}.json)匯入原生格式。
   * 失敗(404 / 非 JSON / 零題)回傳 null,讓呼叫端 fallback 到 HTML 解析路徑。
   */
  private async tryImportNative(userId: string, svid: string): Promise<ImportResult | null> {
    const jsonUrl = `https://www.surveycake.com/s3/json/${svid}.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let raw: unknown;
    try {
      const res = await fetch(jsonUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'QuanWen/1.0', Accept: 'application/json' },
        redirect: 'follow',
      });
      if (!res.ok) return null;
      raw = await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }

    const parsed = parseSurveyCakeNative(raw);
    if (parsed.questions.length === 0) return null;

    const v1: QuanWenSurveyV1 = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'surveycake-import' },
      survey: {
        title: parsed.title,
        description: parsed.description,
        type: 'standard',
        isAnonymous: true,
        rewardPoints: 0,
        targetCount: 100,
        aiReviewEnabled: true,
        questions: parsed.questions,
      },
    };

    const result = await this.importer.importFromJson(userId, v1);
    this.logger.log(
      `SurveyCake 原生匯入完成 user=${userId.slice(0, 8)} svid=${svid} ` +
        `匯入=${result.questionsCount} warnings=${parsed.warnings.length}`,
    );
    return {
      ...result,
      warnings: [...result.warnings, ...parsed.warnings],
    };
  }

  // ─── 內部方法 ──────────────────────────────────────────────────────────────

  /**
   * 從各種 SurveyCake JSON 結構中提取題目
   */
  private extractQuestions(
    data: Record<string, unknown>,
    warnings: string[],
  ): any[] {
    // 嘗試不同的題目欄位名
    const questionsRaw = this.findArray(data, [
      'questions', 'questionList', 'items', 'fields', 'elements',
    ]);

    if (!questionsRaw || questionsRaw.length === 0) {
      // 嘗試深層搜尋
      const deep = this.deepSearchQuestions(data);
      if (deep.length > 0) return deep;
      return [];
    }

    const questions: any[] = [];

    for (let i = 0; i < questionsRaw.length; i++) {
      const item = questionsRaw[i];
      if (!item || typeof item !== 'object') continue;

      const raw = item as Record<string, unknown>;
      const title = this.extractString(raw, ['subject', 'title', 'text', 'label', 'question', 'name']);
      if (!title) continue;

      const rawType = this.extractString(raw, ['type', 'questionType', 'qtype']) || 'text';
      const mappedType = TYPE_MAP[rawType.toLowerCase()] || 'text';

      if (!VALID_QUESTION_TYPES.has(mappedType)) {
        warnings.push(`第 ${i + 1} 題「${title}」題型「${rawType}」不支援，已轉為文字題`);
      }

      const isRequired = this.extractBool(raw, ['required', 'isRequired', 'mandatory'], false);
      const options = this.extractOptions(raw);

      const question: any = {
        type: mappedType,
        title,
        sortOrder: i,
        isRequired,
        config: {},
      };

      if (mappedType === 'rating') {
        // 嘗試提取 scale max
        const max = this.extractNumber(raw, ['max', 'maxValue', 'scale', 'steps'], 5);
        question.config = { max: Math.min(Math.max(max, 2), 10) };
      }

      if (options.length > 0 && (mappedType === 'single_choice' || mappedType === 'multiple_choice')) {
        question.options = options.map((label, oi) => ({ label, sortOrder: oi }));
      }

      questions.push(question);
    }

    return questions.slice(0, 50);
  }

  /**
   * 從題目物件中提取選項
   */
  private extractOptions(item: Record<string, unknown>): string[] {
    // 嘗試各種選項欄位名
    const optionsRaw = this.findArray(item, [
      'options', 'choices', 'answers', 'values', 'items',
    ]);

    if (optionsRaw) {
      return optionsRaw
        .map((o) => {
          if (typeof o === 'string') return o.trim();
          if (typeof o === 'object' && o !== null) {
            const obj = o as Record<string, unknown>;
            return this.extractString(obj, ['label', 'text', 'title', 'name', 'value']) || '';
          }
          return '';
        })
        .filter(Boolean);
    }

    // 嘗試逗號分隔字串
    const optionsStr = this.extractString(item, ['options', 'choices']);
    if (optionsStr) {
      return optionsStr.split(/[,;，；\n]/).map((s) => s.trim()).filter(Boolean);
    }

    return [];
  }

  /**
   * 從 HTML 中提取嵌入的 JSON 資料
   */
  private extractJsonFromHtml(html: string): unknown | null {
    // SurveyCake 可能在 script 標籤中嵌入 JSON
    const patterns = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/,
      /window\.surveyData\s*=\s*({[\s\S]*?});?\s*<\/script>/,
      /"questions"\s*:\s*\[/,
      /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(html);
      if (match) {
        try {
          const jsonStr = match[1] || match[0];
          return JSON.parse(jsonStr);
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * 深層搜尋整個 JSON 找 questions 陣列
   */
  private deepSearchQuestions(data: unknown, depth = 0): any[] {
    if (depth > 5) return [];
    if (!data || typeof data !== 'object') return [];

    const obj = data as Record<string, unknown>;
    for (const key of ['questions', 'questionList', 'items', 'fields']) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) {
        const arr = obj[key] as unknown[];
        if (arr.every((item) => typeof item === 'object' && item !== null)) {
          return this.extractQuestions(obj, []);
        }
      }
    }

    // 遞迴搜尋
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const result = this.deepSearchQuestions(value, depth + 1);
        if (result.length > 0) return result;
      }
    }

    return [];
  }

  // ─── 通用提取工具 ──────────────────────────────────────────────────────────

  private extractString(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
    return null;
  }

  private extractBool(obj: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
      }
      if (typeof val === 'number') return val !== 0;
    }
    return fallback;
  }

  private extractNumber(obj: Record<string, unknown>, keys: string[], fallback: number): number {
    for (const key of keys) {
      const val = obj[key];
      if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
      if (typeof val === 'string') {
        const n = Number(val);
        if (Number.isFinite(n)) return Math.trunc(n);
      }
    }
    return fallback;
  }

  private findArray(obj: Record<string, unknown>, keys: string[]): unknown[] | null {
    for (const key of keys) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0) return val;
    }
    return null;
  }
}
