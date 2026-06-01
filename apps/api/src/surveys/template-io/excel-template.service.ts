import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

/**
 * Phase 1.5:產生空白 Excel 樣板,供問卷主下載填寫後再上傳。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md §4
 *
 * Workbook 結構(4 sheet):
 *   - Survey     ── 問卷基本資料(1 列填寫)
 *   - Questions  ── 題目列表(N 列,sortOrder 為序)
 *   - Audience   ── 受眾鎖定(key-value 兩欄)
 *   - _Help      ── 填寫指引、可用值列舉、範例(_ 開頭表示不解析)
 */

const TEMPLATE_FILENAME = 'QuanWen_Survey_Template.xlsx';

const SURVEY_HEADERS = [
  'title', 'description', 'type', 'category',
  'isAnonymous', 'rewardPoints', 'targetCount', 'aiReviewEnabled',
  'externalUrl', 'expiresAt',
] as const;

const QUESTION_HEADERS = [
  'sortOrder', 'type', 'title', 'description', 'isRequired', 'config_json',
  'option_1', 'option_2', 'option_3', 'option_4', 'option_5',
  'option_6', 'option_7', 'option_8', 'option_9', 'option_10',
  'option_11', 'option_12', 'option_13', 'option_14', 'option_15',
  'option_16', 'option_17', 'option_18', 'option_19', 'option_20',
] as const;

const AUDIENCE_KEYS = [
  'ageRange', 'gender', 'region', 'occupation', 'industry', 'education',
  'minReputationScore', 'requiredTagIds', 'tagMatchMode',
] as const;

@Injectable()
export class ExcelTemplateService {
  static readonly FILENAME = TEMPLATE_FILENAME;

  async generate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QuanWen';
    wb.created = new Date();

    this.buildSurveySheet(wb);
    this.buildQuestionsSheet(wb);
    this.buildAudienceSheet(wb);
    this.buildHelpSheet(wb);

    const out = await wb.xlsx.writeBuffer();
    return Buffer.from(out);
  }

  private buildSurveySheet(wb: ExcelJS.Workbook) {
    const s = wb.addWorksheet('Survey');
    s.addRow(SURVEY_HEADERS as unknown as string[]);
    s.getRow(1).font = { bold: true };
    // 範例列(用戶可參考或刪除自填)
    s.addRow([
      '我的問卷標題',
      '簡短描述(選填,上限 2000 字)',
      'standard',
      'consumer',
      true,
      0,
      100,
      true,
      '',
      '',
    ]);
    s.columns.forEach((col) => (col.width = 18));
  }

  private buildQuestionsSheet(wb: ExcelJS.Workbook) {
    const s = wb.addWorksheet('Questions');
    s.addRow(QUESTION_HEADERS as unknown as string[]);
    s.getRow(1).font = { bold: true };
    // 5 種題型各示範一列
    s.addRow([0, 'single_choice', '你最近三個月買過嗎?', '', true, '{}', '有', '沒有']);
    s.addRow([1, 'multiple_choice', '你看重哪些功能?(可複選)', '', true, '{"maxSelect":3}', '價格', '品質', '外觀', '售後']);
    s.addRow([2, 'text', '你的建議?', '簡述即可', false, '{"multiline":true,"maxLength":500}']);
    s.addRow([3, 'rating', '整體滿意度', '', true, '{"max":5}']);
    s.addRow([4, 'matrix', '請依重要性評分', '', true,
      '{"rows":["價格","品質","外觀"],"cols":["不重要","普通","重要"],"cellType":"radio"}']);
    s.columns.forEach((col, idx) => (col.width = idx < 6 ? 16 : 14));
  }

  private buildAudienceSheet(wb: ExcelJS.Workbook) {
    const s = wb.addWorksheet('Audience');
    s.addRow(['key', 'value(逗號分隔多項;留空表示不限)']);
    s.getRow(1).font = { bold: true };
    for (const key of AUDIENCE_KEYS) {
      s.addRow([key, '']);
    }
    s.getColumn(1).width = 22;
    s.getColumn(2).width = 50;
  }

  private buildHelpSheet(wb: ExcelJS.Workbook) {
    const s = wb.addWorksheet('_Help');
    const lines: Array<[string]> = [
      ['QuanWen 問卷 Excel 樣板使用說明'],
      [''],
      ['【Survey】 sheet(只填 1 列資料)'],
      ['  - type: standard | mutual'],
      ['  - category: consumer | academic | wellness | workplace | lifestyle | tech | social | education | finance | other'],
      ['  - isAnonymous / aiReviewEnabled: TRUE / FALSE'],
      ['  - rewardPoints: 0..1000、targetCount: 1..10000'],
      ['  - expiresAt: ISO8601(例 2026-12-31T23:59:59Z),可留空'],
      [''],
      ['【Questions】 sheet(每列一題,最多 50 題)'],
      ['  - sortOrder: 排序(0 起;若填錯會自動依列序重排)'],
      ['  - type: single_choice | multiple_choice | text | rating | matrix'],
      ['  - isRequired: TRUE / FALSE(預設 TRUE)'],
      ['  - config_json: 題型彈性參數(JSON 字串)'],
      ['      single_choice / multiple_choice: 預設 {} 或 {"minSelect":N, "maxSelect":N}'],
      ['      text: {"multiline":true, "maxLength":500}'],
      ['      rating: {"max":5}(必填)'],
      ['      matrix: {"rows":[...], "cols":[...], "cellType":"radio|checkbox"}(必填)'],
      ['  - option_1..option_20: 選項標籤(choice 題必填;text/rating 留空)'],
      [''],
      ['【Audience】 sheet(受眾鎖定;不填等於不限)'],
      ['  - value 用逗號分隔多項(例 "18-24,25-34")'],
      ['  - requiredTagIds: 用 UUID;跨環境匯入找不到會被丟棄並警告(不擋匯入)'],
      ['  - tagMatchMode: any | all'],
      [''],
      ['【規則】'],
      ['  - 此檔上傳到 POST /surveys/import/xlsx 後會建為新問卷,狀態 draft'],
      ['  - 想真的上架請呼叫 /surveys/{id}/publish 觸發 AI 審核'],
      ['  - 解析失敗會回 422 並列出第幾列、第幾欄的問題'],
    ];
    for (const line of lines) s.addRow(line);
    s.getColumn(1).width = 110;
  }
}
