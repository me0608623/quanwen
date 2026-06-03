/** 將二維字串陣列轉為 CSV（含 UTF-8 BOM、雙引號跳脫），供瀏覽器下載。 */
export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
