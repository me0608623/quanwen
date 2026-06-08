import { describe, expect, it } from 'vitest';
import { lotteryDisclosure, lotteryDrawRule } from './lottery-display';

describe('lotteryDrawRule', () => {
  it('describes automatic and creator-notified draws', () => {
    expect(lotteryDrawRule({ lotteryDrawMode: 'when_full' })).toBe('問卷收滿後由系統自動開獎');
    expect(lotteryDrawRule({ lotteryDrawMode: 'manual' })).toBe('問卷收滿後由建立者通知開獎');
  });

  it('shows a Taipei-local date for scheduled draws', () => {
    const out = lotteryDisclosure({
      lotteryWinnerCount: 3,
      lotteryDrawMode: 'scheduled',
      lotteryDrawAt: '2026-06-10T01:00:00.000Z',
    });
    // 01:00 UTC → 09:00 Asia/Taipei。不硬比對 Intl 完整輸出（不同 Node ICU 版本的
    // 空白字元/分隔符會變，導致 toContain 在 CI 失敗），改驗結構 + 台北時區的日期與時間。
    expect(out).toContain('3 名中獎者');
    expect(out).toContain('預計於');
    expect(out).toMatch(/2026\/6\/10/);
    expect(out).toMatch(/9:00:00/);
    expect(out).toContain('若問卷提前截止，將依截止時有效資格名單開獎');
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
