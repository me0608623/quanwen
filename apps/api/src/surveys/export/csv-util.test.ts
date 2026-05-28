import { describe, it, expect } from 'vitest';
import { escapeCsvCell, toCsvLine } from './csv-util';

describe('escapeCsvCell', () => {
  it('一般字串原樣', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
  });
  it('數字 → 字串', () => {
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(0)).toBe('0');
  });
  it('null/undefined → 空字串', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
  it('含逗號 → 包雙引號', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
  });
  it('含引號 → 引號加倍 + 包雙引號', () => {
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
  });
  it('含換行 → 包雙引號', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
  it('公式注入防護：= + - @ 開頭前置單引號', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });
  it('公式注入 + 逗號 → 前置單引號再包引號', () => {
    expect(escapeCsvCell('=A,B')).toBe('"\'=A,B"');
  });
});

describe('toCsvLine', () => {
  it('組行並各自跳脫', () => {
    expect(toCsvLine(['a', 'b,c', 42, null])).toBe('a,"b,c",42,');
  });
});
