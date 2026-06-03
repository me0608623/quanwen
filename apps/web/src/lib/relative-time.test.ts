import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const NOW = new Date('2026-06-03T10:00:00.000Z').getTime();
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

describe('relativeTime', () => {
  it('< 60s → 剛剛', () => {
    expect(relativeTime(ago(30), NOW)).toBe('剛剛');
  });
  it('分鐘', () => {
    expect(relativeTime(ago(60 * 39), NOW)).toBe('39 分鐘前');
  });
  it('小時', () => {
    expect(relativeTime(ago(3600 * 3), NOW)).toBe('3 小時前');
  });
  it('天', () => {
    expect(relativeTime(ago(86400 * 2), NOW)).toBe('2 天前');
  });
  it('> 7 天 → 日期', () => {
    const r = relativeTime(ago(86400 * 10), NOW);
    expect(r).not.toMatch(/前|剛剛/);
  });
  it('未來時間（時鐘偏移）→ 剛剛（不顯示負數）', () => {
    expect(relativeTime(new Date(NOW + 5000).toISOString(), NOW)).toBe('剛剛');
  });
  it('邊界:恰好 60s → 1 分鐘前', () => {
    expect(relativeTime(ago(60), NOW)).toBe('1 分鐘前');
  });
  it('邊界:恰好 1 小時 → 1 小時前', () => {
    expect(relativeTime(ago(3600), NOW)).toBe('1 小時前');
  });
  it('邊界:恰好 1 天 → 1 天前', () => {
    expect(relativeTime(ago(86400), NOW)).toBe('1 天前');
  });
});
