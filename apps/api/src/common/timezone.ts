/** Asia/Taipei calendar helpers for bucketing (earnings months, daily trends, etc.). */

export const TAIPEI_TZ = 'Asia/Taipei';

/** YYYY-MM-DD in Asia/Taipei. */
export function taipeiDateKey(input: Date | string | number = new Date()): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** YYYY-MM in Asia/Taipei (for monthly charts / this-month summaries). */
export function taipeiMonthKey(input: Date | string | number = new Date()): string {
  const day = taipeiDateKey(input);
  return day ? day.slice(0, 7) : '';
}

/** Instant of 00:00:00 on the 1st of the Taipei calendar month containing `input`. */
export function startOfTaipeiMonth(input: Date | string | number = new Date()): Date {
  const ym = taipeiMonthKey(input);
  if (!ym) return new Date(NaN);
  return new Date(`${ym}-01T00:00:00+08:00`);
}
