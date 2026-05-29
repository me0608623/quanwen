import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  V1_SCHEMA_TAG,
  type QuanWenSurveyV1,
} from './quanwen-survey-v1.schema';
import {
  extractFbPublicLoadData,
  mapFormToV1,
  type SkippedQuestion,
} from './google-forms-parser';
import { SurveyImportService, type ImportResult } from './survey-import.service';

/**
 * Phase 2:從 Google Forms 匯入問卷模板。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md §2 Phase 2
 *
 * 雙路 input:
 *   - { url }  → 我們從 https://docs.google.com/forms/.../viewform 抓 HTML(SSRF 嚴格防護)
 *   - { html } → 使用者自己下載 HTML 上傳(離線/需登入 forms 的 fallback)
 *
 * 流程:HTML → extract FB_PUBLIC_LOAD_DATA_ → mapFormToV1 → SurveyImportService.importFromJson
 *
 * 不支援題型(date / time / image / video / file_upload)→ 列入 result.skipped,
 *   但 **不擋整份匯入**(設計藍圖原文「不偷偷降級沉默丟失」改為「明確 422+列出」
 *   會讓用戶必須在 source 端先改才能匯,實務上不友善)。改為「軟跳過 + warning」,
 *   呼應 v1 schema 跨環境 tagId 失效的處理策略。
 */

const ALLOWED_HOSTS = new Set<string>(['docs.google.com']);
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface GoogleFormsImportInput {
  url?: string;
  html?: string;
}

export interface GoogleFormsImportResult extends ImportResult {
  /** 本次匯入有哪些題型被略過(date / file_upload 等不支援題) */
  skippedFromSource: SkippedQuestion[];
}

@Injectable()
export class GoogleFormsImportService {
  private readonly logger = new Logger(GoogleFormsImportService.name);

  constructor(private readonly importer: SurveyImportService) {}

  async importFromGoogleForms(
    userId: string,
    input: GoogleFormsImportInput,
  ): Promise<GoogleFormsImportResult> {
    if (!input.url && !input.html) {
      throw new BadRequestException('必須提供 url 或 html 其中之一');
    }
    if (input.url && input.html) {
      throw new BadRequestException('url 與 html 不可同時提供');
    }

    const html = input.html ?? (await this.fetchFormHtml(input.url as string));

    // 抽 FB_PUBLIC_LOAD_DATA_
    let raw: unknown;
    try {
      raw = extractFbPublicLoadData(html);
    } catch (err) {
      throw new BadRequestException({
        error: {
          code: 'GOOGLE_FORMS_PARSE_ERROR',
          message: (err as Error).message,
        },
      });
    }

    // 對映到 v1 body
    const { body, skipped } = mapFormToV1(raw);

    if (body.questions.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'GOOGLE_FORMS_EMPTY',
          message: '此 Google Form 無可匯入題目(全部為不支援題型或表單為空)',
          details: skipped,
        },
      });
    }

    // 包成完整 v1 JSON,走既有 importer 同一條路徑(Zod 二次驗證 + tagId 過濾 + create)
    const v1: QuanWenSurveyV1 = {
      $schema: V1_SCHEMA_TAG,
      exportedAt: new Date().toISOString(),
      platform: { name: 'quanwen', version: 'google-forms-import' },
      survey: body,
    };

    const result = await this.importer.importFromJson(userId, v1);

    // 把 skipped 訊息揉進 warnings,讓呼叫端一次看到完整結果
    const skippedWarnings = skipped.map(
      (s) => `略過第 ${s.index + 1} 題(${s.type}: ${s.title}):${s.reason}`,
    );
    const warnings = [...result.warnings, ...skippedWarnings];

    this.logger.log(
      `Google Forms 匯入完成 user=${userId.slice(0, 8)} ` +
        `survey=${result.id} 匯入=${result.questionsCount} 跳過=${skipped.length}`,
    );

    return {
      ...result,
      warnings,
      skippedFromSource: skipped,
    };
  }

  // ─── HTML fetch + SSRF 防護 ──────────────────────────────────────────────

  /**
   * 從 docs.google.com 抓 viewform HTML。
   *
   * SSRF 防護:
   * - 只允許 https
   * - hostname 必須在 ALLOWED_HOSTS(白名單)
   * - hostname 不可為 IPv4 / IPv6 / localhost / private range
   * - redirect 手動處理,每跳重新驗 hostname(最多 3 跳)
   * - 10 秒 timeout、5MB size 上限、content-type 必須 text/html
   */
  private async fetchFormHtml(rawUrl: string): Promise<string> {
    let currentUrl = this.validateUrl(rawUrl);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'QuanWen-Importer/1.0 (+https://quanwen.tw)',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          },
        });
      } catch (err) {
        clearTimeout(timeout);
        const msg = (err as Error)?.name === 'AbortError' ? '請求逾時(10s)' : (err as Error)?.message;
        throw new BadRequestException(`抓取 Google Forms HTML 失敗: ${msg}`);
      }
      clearTimeout(timeout);

      // 處理 redirect:重新驗 hostname
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new BadRequestException(`HTTP ${res.status} 但無 Location header`);
        const next = new URL(loc, currentUrl);
        currentUrl = this.validateUrl(next.toString());
        continue;
      }

      if (!res.ok) {
        throw new BadRequestException(`抓取 Google Forms HTML 失敗: HTTP ${res.status}`);
      }

      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/html')) {
        throw new BadRequestException(`預期 text/html 回應,實際 ${ct || '無 content-type'}`);
      }

      // size 防護:先看 content-length,再做 streaming 截斷
      const lenHeader = res.headers.get('content-length');
      if (lenHeader && Number(lenHeader) > MAX_HTML_BYTES) {
        throw new BadRequestException(`HTML 超過 ${MAX_HTML_BYTES} bytes 上限`);
      }

      const html = await res.text();
      if (html.length > MAX_HTML_BYTES) {
        throw new BadRequestException(`HTML 超過 ${MAX_HTML_BYTES} bytes 上限`);
      }
      return html;
    }

    throw new BadRequestException(`超過 ${MAX_REDIRECTS} 次重導`);
  }

  /**
   * 驗 URL 安全:回傳正規化後的字串;不通過則丟 BadRequestException。
   */
  private validateUrl(raw: string): string {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BadRequestException('URL 格式錯誤');
    }
    if (u.protocol !== 'https:') {
      throw new BadRequestException('只接受 https URL');
    }
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      throw new BadRequestException(
        `URL 主機名 ${u.hostname} 不在白名單;只接受 ${[...ALLOWED_HOSTS].join(', ')}`,
      );
    }
    // 雙保險:IP literal / localhost / 內網
    if (this.isPrivateHostname(u.hostname)) {
      throw new BadRequestException('不接受 IP 字面或內網位址');
    }
    return u.toString();
  }

  private isPrivateHostname(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost') return true;
    // IPv4
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
    // IPv6 字面(任意含 `:` 的)
    if (lower.includes(':')) return true;
    return false;
  }
}
