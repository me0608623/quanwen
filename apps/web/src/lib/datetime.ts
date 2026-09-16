/** Asia/Taipei datetime formatting for user-facing timestamps. */

export const TAIPEI_TZ = 'Asia/Taipei';

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: TAIPEI_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: TAIPEI_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const SHORT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: TAIPEI_TZ,
  month: 'short',
  day: 'numeric',
};

function toDate(input: string | number | Date): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. 2026/09/16 20:24（台北時間） */
export function formatDateTime(input: string | number | Date | null | undefined): string {
  if (input == null) return '—';
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleString('zh-TW', DATETIME_OPTS);
}

/** e.g. 2026/09/16 */
export function formatDate(input: string | number | Date | null | undefined): string {
  if (input == null) return '—';
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleDateString('zh-TW', DATE_OPTS);
}

/** Trend chart axis label, e.g. 9月16日 */
export function formatShortDate(input: string | number | Date | null | undefined): string {
  if (input == null) return '—';
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleDateString('zh-TW', SHORT_DATE_OPTS);
}

/** YYYY-MM-DD in Asia/Taipei (for filling calendar series). */
export function taipeiDateKey(input: string | number | Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '';
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** YYYY-MM in Asia/Taipei (monthly chart keys from API use this calendar). */
export function taipeiMonthKey(input: string | number | Date = new Date()): string {
  const day = taipeiDateKey(input);
  return day ? day.slice(0, 7) : '';
}
