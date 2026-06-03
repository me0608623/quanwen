import { describe, expect, it } from 'vitest';
import { lotteryDisclosure, lotteryDrawRule } from './lottery-display';

describe('lotteryDrawRule', () => {
  it('describes automatic and creator-notified draws', () => {
    expect(lotteryDrawRule({ lotteryDrawMode: 'when_full' })).toBe('問卷收滿後由系統自動開獎');
    expect(lotteryDrawRule({ lotteryDrawMode: 'manual' })).toBe('問卷收滿後由建立者通知開獎');
  });

  it('shows a Taipei-local date for scheduled draws', () => {
    expect(lotteryDisclosure({
      lotteryWinnerCount: 3,
      lotteryDrawMode: 'scheduled',
      lotteryDrawAt: '2026-06-10T01:00:00.000Z',
    })).toContain('3 名中獎者 · 預計於 2026/6/10 上午9:00:00 開獎');
    expect(lotteryDisclosure({
      lotteryWinnerCount: 3,
      lotteryDrawMode: 'scheduled',
      lotteryDrawAt: '2026-06-10T01:00:00.000Z',
    })).toContain('若問卷提前截止，將依截止時有效資格名單開獎');
  });

  it('falls back when draw mode is missing or scheduled without a date', () => {
    expect(lotteryDrawRule({})).toBe('依問卷建立者公告開獎');
    expect(lotteryDrawRule({ lotteryDrawMode: null })).toBe('依問卷建立者公告開獎');
    expect(lotteryDrawRule({ lotteryDrawMode: 'scheduled', lotteryDrawAt: null }))
      .toBe('依問卷建立者公告開獎');
  });
});

describe('lotteryDisclosure', () => {
  it('defaults to 1 winner when count is missing', () => {
    expect(lotteryDisclosure({ lotteryDrawMode: 'when_full' })).toContain('1 名中獎者');
  });

  it('combines winner count and draw rule', () => {
    const s = lotteryDisclosure({ lotteryWinnerCount: 5, lotteryDrawMode: 'when_full' });
    expect(s).toBe('5 名中獎者 · 問卷收滿後由系統自動開獎；若問卷提前截止，將依截止時有效資格名單開獎');
  });
});
