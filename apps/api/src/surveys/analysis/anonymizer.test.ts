import { describe, it, expect } from 'vitest';
import { redactPii, pseudonym } from './anonymizer';

describe('redactPii', () => {
  it('遮蔽 email', () => {
    expect(redactPii('聯絡 a.b+x@mail.com 謝謝')).toBe('聯絡 [已遮蔽] 謝謝');
  });
  it('遮蔽身分證', () => {
    expect(redactPii('身分證 A123456789')).toBe('身分證 [已遮蔽]');
  });
  it('遮蔽手機', () => {
    expect(redactPii('打 0912345678 給我')).toBe('打 [已遮蔽] 給我');
    expect(redactPii('0912-345-678')).toBe('[已遮蔽]');
  });
  it('遮蔽長數字（卡號等）', () => {
    expect(redactPii('卡 1234567890123456')).toBe('卡 [已遮蔽]');
  });
  it('一般文字不動', () => {
    expect(redactPii('這份問卷很好，我給 5 分')).toBe('這份問卷很好，我給 5 分');
  });
  it('null/空字串 → 空字串', () => {
    expect(redactPii(null)).toBe('');
    expect(redactPii(undefined)).toBe('');
    expect(redactPii('')).toBe('');
  });
});

describe('pseudonym', () => {
  it('同問卷同受試者 → 穩定一致', () => {
    expect(pseudonym('s1', 'u1')).toBe(pseudonym('s1', 'u1'));
  });
  it('不同受試者 → 不同假名', () => {
    expect(pseudonym('s1', 'u1')).not.toBe(pseudonym('s1', 'u2'));
  });
  it('同受試者跨問卷不可連結（不同假名）', () => {
    expect(pseudonym('s1', 'u1')).not.toBe(pseudonym('s2', 'u1'));
  });
  it('不外洩原始 id，格式 R-<8 hex>', () => {
    const p = pseudonym('survey-abc', 'respondent-xyz');
    expect(p).toMatch(/^R-[0-9a-f]{8}$/);
    expect(p).not.toContain('respondent-xyz');
  });
});
