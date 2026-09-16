import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDate, formatShortDate, taipeiDateKey, taipeiMonthKey } from './datetime';

describe('datetime (Asia/Taipei)', () => {
  it('formats UTC midnight as Taipei morning', () => {
    // 2026-09-16T00:00:00Z → 08:00 Taipei
    const s = formatDateTime('2026-09-16T00:00:00.000Z');
    expect(s).toContain('2026');
    expect(s).toContain('09');
    expect(s).toContain('16');
    expect(s).toMatch(/08:00/);
  });

  it('formats date-only without crashing', () => {
    expect(formatDate('2026-09-16T16:00:00.000Z')).toMatch(/2026/);
  });

  it('returns em dash for invalid / null', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('taipeiDateKey uses Taipei calendar day near UTC midnight', () => {
    // 2026-09-15T17:00:00Z = 2026-09-16 01:00 Taipei
    expect(taipeiDateKey('2026-09-15T17:00:00.000Z')).toBe('2026-09-16');
  });

  it('formatShortDate returns zh-TW month/day', () => {
    const s = formatShortDate('2026-09-16T00:00:00.000Z');
    expect(s.length).toBeGreaterThan(2);
  });

  it('taipeiMonthKey buckets near UTC month boundary', () => {
    expect(taipeiMonthKey('2026-08-31T17:00:00.000Z')).toBe('2026-09');
  });
});
