/**
 * CSV cell 跳脫 + 防公式注入（SSOT: 問卷資料儲存與規模化設計.md §5.7）。
 * 純函式。取代手刻的 replace(/"/g,'""')（不防 Excel 公式注入）。
 */

// 危險前導字元（Excel/Sheets 會當公式執行）：= + - @ 與 tab/CR。
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** 跳脫單一 cell：先防注入，再依需要包雙引號。 */
export function escapeCsvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (FORMULA_LEAD.test(s)) s = `'${s}`; // 公式注入防護：前置單引號
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 把一列 cells 組成 CSV 行（不含換行）。 */
export function toCsvLine(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}
