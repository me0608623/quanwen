import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SurveyImportService, type ImportResult } from './survey-import.service';
import { CsvImportService } from './csv-import.service';

/**
 * Phase 2.3: Google Sheets 公開連結匯入服務
 *
 * 支援兩種 Google Sheets 公開方式:
 * 1. 「發布到網路」CSV 連結: https://docs.google.com/spreadsheets/d/{id}/pub?output=csv
 * 2. 「共用」連結 + export format: https://docs.google.com/spreadsheets/d/{id}/export?format=csv
 *
 * 只需將 Google Sheets 設為「知道連結的人都能查看」或「發布到網路」即可。
 * Sheet 結構需與 QuanWen Excel 模板相同（Survey + Questions sheets）。
 */

const ALLOWED_HOSTS = new Set([
  'docs.google.com',
  'spreadsheets.google.com',
]);

const FETCH_TIMEOUT_MS = 15_000;
const MAX_CSV_BYTES = 5 * 1024 * 1024;

export interface GoogleSheetsImportInput {
  url: string;
  /** 指定 sheet index (預設 0，即第一個 sheet / gid=0) */
  gid?: string;
}

@Injectable()
export class GoogleSheetsImportService {
  private readonly logger = new Logger(GoogleSheetsImportService.name);

  constructor(private readonly csvImport: CsvImportService) {}

  async importFromGoogleSheets(userId: string, input: GoogleSheetsImportInput): Promise<ImportResult> {
    const csvUrl = this.buildCsvUrl(input.url, input.gid);

    this.logger.log(`fetching Google Sheets CSV: ${csvUrl}`);

    // Fetch CSV
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(csvUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'QuanWen/1.0' },
        redirect: 'follow',
      });
    } catch (err) {
      throw new BadRequestException(
        `無法連線 Google Sheets: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Google Sheets 回應錯誤: HTTP ${response.status} — 請確認試算表已設為公開或發布到網路`,
      );
    }

    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > MAX_CSV_BYTES) {
      throw new BadRequestException(
        `CSV 檔案過大 (${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB)，上限 5MB`,
      );
    }

    const buffer = Buffer.from(arrayBuf);

    // 檢查是否為 HTML（未公開的試算表會回 HTML 登入頁）
    const preview = buffer.toString('utf-8', 0, Math.min(200, buffer.length));
    if (preview.trimStart().startsWith('<!') || preview.trimStart().startsWith('<html')) {
      throw new BadRequestException(
        '收到的不是 CSV 而是 HTML — 請確認試算表已設為「知道連結的人都能查看」或「檔案 → 發布到網路」',
      );
    }

    return this.csvImport.importFromCsv(userId, buffer);
  }

  /**
   * 將 Google Sheets URL 轉為 CSV export URL
   *
   * 接受格式:
   * - https://docs.google.com/spreadsheets/d/{ID}/edit
   * - https://docs.google.com/spreadsheets/d/{ID}/edit#gid=123
   * - https://docs.google.com/spreadsheets/d/{ID}/pub
   * - https://docs.google.com/spreadsheets/d/{ID}/pub?output=csv
   * - https://docs.google.com/spreadsheets/d/{ID}/export?format=csv
   */
  private buildCsvUrl(rawUrl: string, gid?: string): string {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('無效的 Google Sheets URL');
    }

    if (!ALLOWED_HOSTS.has(url.hostname)) {
      throw new BadRequestException(
        `不允許的主機: ${url.hostname}，僅支援 docs.google.com`,
      );
    }

    // 提取 spreadsheet ID
    const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      throw new BadRequestException(
        '無法從 URL 中解析 spreadsheet ID — 請使用完整的 Google Sheets 連結',
      );
    }

    const spreadsheetId = match[1];
    const gidValue = gid || url.hash.match(/gid=(\d+)/)?.[1] || '0';

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gidValue}`;
  }
}
