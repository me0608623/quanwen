/**
 * Phase 2:Google Forms HTML → QuanWenSurvey v1 body 純函數轉換。
 *
 * 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md §2 Phase 2
 *
 * 資料來源:Google Forms viewform HTML 頁面內嵌的全域變數:
 *   var FB_PUBLIC_LOAD_DATA_ = [..., [...form data...]];
 *
 * 已驗證的結構假設(基於開源 google-forms-html-parser 慣例):
 *   FB_PUBLIC_LOAD_DATA_[1][1]  = 題目陣列
 *   FB_PUBLIC_LOAD_DATA_[1][8]  = 表單標題(部分版本在 [3])
 *   FB_PUBLIC_LOAD_DATA_[1][0]  = 表單描述
 *
 *   item[0] = 題目 ID
 *   item[1] = 題目文字
 *   item[2] = 描述/說明(常為 null)
 *   item[3] = 題型代碼(0..13)
 *   item[4] = 題目資料(依題型不同)
 *
 * 題型映射(per design §2 Phase 2):
 *   0 = Short answer      → text {multiline: false}
 *   1 = Paragraph         → text {multiline: true}
 *   2 = Multiple choice   → single_choice
 *   3 = Dropdown          → single_choice(降級)
 *   4 = Checkboxes        → multiple_choice
 *   5 = Linear scale      → rating {max: N}
 *   6 = Title/Section     → SKIP(裝飾,非題目)
 *   7 = Grid              → matrix(radio 或 checkbox 視 flag)
 *   8 = Section break     → SKIP
 *   9 = Date              → SKIP(回 422,題型不支援)
 *  10 = Time              → SKIP
 *  11 = Image             → SKIP
 *  12 = Video             → SKIP
 *  13 = File upload       → SKIP
 */

import type { QuanWenSurveyV1Body } from './quanwen-survey-v1.schema';

const UNSUPPORTED_TYPE_NAMES: Record<number, string> = {
  9: 'date',
  10: 'time',
  11: 'image',
  12: 'video',
  13: 'file_upload',
};

const DECORATIVE_TYPES = new Set([6, 8]); // section title / break — 裝飾,不算題目,不列入 skipped

/** 單份問卷題數上限,需與 quanwen-survey-v1.schema.ts 的 questions.max(50) 一致 */
const MAX_QUESTIONS = 50;

export interface SkippedQuestion {
  index: number;
  type: string;
  title: string;
  reason: string;
}

export interface GoogleFormsMapResult {
  body: QuanWenSurveyV1Body;
  skipped: SkippedQuestion[];
}

/**
 * 從 Google Forms viewform HTML 抽出 FB_PUBLIC_LOAD_DATA_ 並 JSON.parse。
 *
 * 容錯:用括號計數找完整陣列(支援巢狀);忽略字串內的 `[` `]`;支援前後空白。
 *
 * @throws Error 如果找不到變數或解析失敗
 */
export function extractFbPublicLoadData(html: string): unknown {
  const marker = 'var FB_PUBLIC_LOAD_DATA_';
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) {
    throw new Error('找不到 FB_PUBLIC_LOAD_DATA_;這份 HTML 不像 Google Forms viewform(也可能需要登入)');
  }
  // 從 marker 之後找第一個 `[`
  let arrayStart = -1;
  for (let i = markerIdx + marker.length; i < html.length; i++) {
    const c = html[i];
    if (c === '[') {
      arrayStart = i;
      break;
    }
    // 跳過 `=`、空白、tab、換行
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '=') {
      throw new Error(`FB_PUBLIC_LOAD_DATA_ 後找不到陣列開頭(遇到非預期字元: ${JSON.stringify(c)})`);
    }
  }
  if (arrayStart < 0) {
    throw new Error('FB_PUBLIC_LOAD_DATA_ 之後找不到 `[`');
  }

  // 走訪到對應的 `]`,正確處理巢狀陣列與字串
  let depth = 0;
  let inString = false;
  let escape = false;
  let arrayEnd = -1;
  for (let i = arrayStart; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }
  if (arrayEnd < 0) {
    throw new Error('FB_PUBLIC_LOAD_DATA_ 陣列沒有正確收尾');
  }

  const json = html.slice(arrayStart, arrayEnd);
  try {
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`FB_PUBLIC_LOAD_DATA_ JSON 解析失敗: ${(err as Error).message}`);
  }
}

/**
 * 把抽出來的 FB_PUBLIC_LOAD_DATA_ 結構映射為 QuanWenSurvey v1 body。
 *
 * 容錯策略:任何單題解析失敗 → push 到 skipped + 繼續處理;
 *           整體結構錯亂 → throw Error(controller 轉 422)。
 */
export function mapFormToV1(data: unknown): GoogleFormsMapResult {
  const root = asArray(data);
  const block = asArray(root[1]);
  const items = asArray(block[1]);

  // 標題位置在不同版本略有差異;按優先順序嘗試
  const title = pickString([block[8], block[3], root[3], '匯入自 Google Forms']);
  const description = pickString([block[0], null]);

  const questions: QuanWenSurveyV1Body['questions'] = [];
  const skipped: SkippedQuestion[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!Array.isArray(item)) continue;
    const type = numberAt(item, 3);
    const itemTitle = stringAt(item, 1) ?? '(無標題)';

    // 裝飾性節點(section header / break)— 直接略過,不算 skipped
    if (type !== undefined && DECORATIVE_TYPES.has(type)) continue;

    // 不支援題型 — 列入 skipped
    if (type !== undefined && UNSUPPORTED_TYPE_NAMES[type] !== undefined) {
      skipped.push({
        index: idx,
        type: UNSUPPORTED_TYPE_NAMES[type] ?? `unknown_${type}`,
        title: itemTitle,
        reason: `Google Forms 題型 ${UNSUPPORTED_TYPE_NAMES[type]} 不被券問平台支援`,
      });
      continue;
    }

    const mapped = mapOne(item, idx, itemTitle);
    if (mapped.ok) {
      // 題數上限:v1 schema questions.max(50)。超過的軟跳過 + warning,
      // 與「不支援題型軟跳過」一致,不讓整份匯入硬失敗。
      if (questions.length >= MAX_QUESTIONS) {
        skipped.push({
          index: idx,
          type: mapped.question.type,
          title: itemTitle,
          reason: `超過單份問卷 ${MAX_QUESTIONS} 題上限,已略過`,
        });
        continue;
      }
      questions.push({ ...mapped.question, sortOrder: questions.length });
    } else {
      skipped.push(mapped.skipped);
    }
  }

  const body: QuanWenSurveyV1Body = {
    title: title.slice(0, 200),
    description: description ? description.slice(0, 2000) : undefined,
    type: 'standard',
    isAnonymous: true,
    rewardPoints: 0,
    targetCount: 100,
    aiReviewEnabled: true,
    questions,
  };

  return { body, skipped };
}

// ─── per-題型 mapping ────────────────────────────────────────────────────────

type Question = QuanWenSurveyV1Body['questions'][number];
type MapOneResult =
  | { ok: true; question: Question }
  | { ok: false; skipped: SkippedQuestion };

function mapOne(item: unknown[], idx: number, title: string): MapOneResult {
  const type = numberAt(item, 3);
  const inner = item[4];
  const innerArr = Array.isArray(inner) ? inner : [];
  const firstSlot = Array.isArray(innerArr[0]) ? (innerArr[0] as unknown[]) : [];
  const description = stringAt(item, 2);
  const isRequired = booleanAt(firstSlot, 2) ?? false;

  const skip = (reason: string, typeName: string): MapOneResult => ({
    ok: false,
    skipped: { index: idx, type: typeName, title, reason },
  });

  switch (type) {
    case 0: // Short answer
      return ok({
        type: 'text',
        title,
        description: description ?? undefined,
        sortOrder: 0,
        isRequired,
        config: { multiline: false },
      });
    case 1: // Paragraph
      return ok({
        type: 'text',
        title,
        description: description ?? undefined,
        sortOrder: 0,
        isRequired,
        config: { multiline: true },
      });
    case 2: // Multiple choice (radio)
    case 3: // Dropdown(降級為 single_choice)
      return mapChoice(firstSlot, 'single_choice', title, description, isRequired, idx, skip);
    case 4: // Checkboxes
      return mapChoice(firstSlot, 'multiple_choice', title, description, isRequired, idx, skip);
    case 5: // Linear scale
      return mapLinearScale(firstSlot, title, description, isRequired, idx, skip);
    case 7: // Grid
      return mapGrid(innerArr, title, description, isRequired, idx, skip);
    default:
      return skip(`unknown_type_${type}`, 'unknown');
  }
}

function ok(question: Question): MapOneResult {
  return { ok: true, question };
}

function mapChoice(
  firstSlot: unknown[],
  qType: 'single_choice' | 'multiple_choice',
  title: string,
  description: string | undefined,
  isRequired: boolean,
  _idx: number,
  skip: (reason: string, typeName: string) => MapOneResult,
): MapOneResult {
  const rawOptions = Array.isArray(firstSlot[1]) ? (firstSlot[1] as unknown[]) : [];
  const options = rawOptions
    .map((o, i) => {
      const arr = Array.isArray(o) ? o : [];
      const label = stringAt(arr, 0);
      return label ? { label: label.slice(0, 300), sortOrder: i } : null;
    })
    .filter((x): x is { label: string; sortOrder: number } => x !== null);

  if (options.length < 2) {
    return skip('選項少於 2 個,無法匯入', qType);
  }

  return ok({
    type: qType,
    title,
    description: description ?? undefined,
    sortOrder: 0,
    isRequired,
    config: {},
    options,
  });
}

function mapLinearScale(
  firstSlot: unknown[],
  title: string,
  description: string | undefined,
  isRequired: boolean,
  _idx: number,
  skip: (reason: string, typeName: string) => MapOneResult,
): MapOneResult {
  const scaleArr = Array.isArray(firstSlot[1]) ? (firstSlot[1] as unknown[]) : [];
  const max = scaleArr.length;
  if (max < 2 || max > 10) {
    return skip(`線性量表刻度 ${max} 超出支援範圍 2..10`, 'rating');
  }

  // 端點標籤(start/end labels):位於 firstSlot[3] 或附近
  let minLabel: string | undefined;
  let maxLabel: string | undefined;
  const labelArr = firstSlot[3];
  if (Array.isArray(labelArr)) {
    const a = labelArr as unknown[];
    if (Array.isArray(a[0])) minLabel = stringAt(a[0] as unknown[], 0) ?? undefined;
    if (Array.isArray(a[a.length - 1])) maxLabel = stringAt(a[a.length - 1] as unknown[], 0) ?? undefined;
  }

  return ok({
    type: 'rating',
    title,
    description: description ?? undefined,
    sortOrder: 0,
    isRequired,
    config: {
      max,
      ...(minLabel || maxLabel ? { labels: { min: minLabel ?? '', max: maxLabel ?? '' } } : {}),
    },
  });
}

function mapGrid(
  innerArr: unknown[],
  title: string,
  description: string | undefined,
  isRequired: boolean,
  _idx: number,
  skip: (reason: string, typeName: string) => MapOneResult,
): MapOneResult {
  // Grid:innerArr 的每個 entry = 一個 row;row[1] 的 [[null, "Col"]] = 該 row 的可選欄位(行整份共用)
  const rows: string[] = [];
  let cols: string[] | null = null;
  let cellType: 'radio' | 'checkbox' = 'radio';

  for (const r of innerArr) {
    if (!Array.isArray(r)) continue;
    const row = r as unknown[];
    // row title 在真實 Google Forms viewform 結構是 row[3] = ["列標題"](陣列,標題在 [0]);
    // 舊版/部分版本可能直接是字串。兩者都支援。
    const rowTitleRaw = row[3];
    const rowTitle = Array.isArray(rowTitleRaw)
      ? stringAt(rowTitleRaw, 0) ?? ''
      : typeof rowTitleRaw === 'string'
        ? rowTitleRaw
        : '';
    if (rowTitle) rows.push(rowTitle.slice(0, 200));

    // 第一個 row 的 cols 當作整份 grid 的欄(row[1] = [["c1"],["c2"],...])
    if (cols === null) {
      const colsRaw = row[1];
      if (Array.isArray(colsRaw)) {
        cols = colsRaw
          .map((c) => (Array.isArray(c) ? stringAt(c as unknown[], 0) : null))
          .filter((c): c is string => !!c)
          .map((s) => s.slice(0, 200));
      }
    }

    // checkbox grid flag — 真實結構在 row[11] = [0|1](陣列, 1=checkbox);
    // 部分版本在 row[7]。取陣列首元素判斷;預設 radio。
    const flagArr = Array.isArray(row[11])
      ? (row[11] as unknown[])
      : Array.isArray(row[7])
        ? (row[7] as unknown[])
        : [];
    if (numberAt(flagArr, 0) === 1) cellType = 'checkbox';
  }

  if (!cols || cols.length === 0 || rows.length === 0) {
    return skip('grid 欄/列為空,無法匯入', 'matrix');
  }

  return ok({
    type: 'matrix',
    title,
    description: description ?? undefined,
    sortOrder: 0,
    isRequired,
    config: { rows, cols, cellType },
  });
}

// ─── 小幫手 ──────────────────────────────────────────────────────────────────

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function numberAt(arr: unknown[], idx: number): number | undefined {
  const v = arr[idx];
  return typeof v === 'number' ? v : undefined;
}

function stringAt(arr: unknown[], idx: number): string | undefined {
  const v = arr[idx];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function booleanAt(arr: unknown[], idx: number): boolean | undefined {
  const v = arr[idx];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  return undefined;
}

function pickString(candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }
  return '匯入自 Google Forms';
}
