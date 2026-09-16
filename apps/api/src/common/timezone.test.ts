import { describe, expect, it } from 'vitest';
import { startOfTaipeiMonth, taipeiDateKey, taipeiMonthKey } from './timezone';

describe('timezone (Asia/Taipei)', () => {
  it('taipeiDateKey crosses UTC midnight into next Taipei day', () => {
    // 2026-08-31 17:00 UTC = 2026-09-01 01:00 Taipei
    expect(taipeiDateKey('2026-08-31T17:00:00.000Z')).toBe('2026-09-01');
  });

  it('taipeiMonthKey buckets near month boundary by Taipei, not UTC', () => {
    // Would be 2026-08 under UTC toISOString().slice(0,7)
    expect(taipeiMonthKey('2026-08-31T17:00:00.000Z')).toBe('2026-09');
    // Still August in Taipei
    expect(taipeiMonthKey('2026-08-31T15:00:00.000Z')).toBe('2026-08');
  });

  it('startOfTaipeiMonth is midnight +08:00 of that month', () => {
    const start = startOfTaipeiMonth('2026-09-16T02:00:00.000Z');
    expect(start.toISOString()).toBe('2026-08-31T16:00:00.000Z'); // Sep 1 00:00 +08
    expect(taipeiMonthKey(start)).toBe('2026-09');
  });
});
