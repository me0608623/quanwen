import { describe, expect, it } from 'vitest';
import { estimateFillMinutes } from './fill-time';
describe('estimateFillMinutes', () => {
  it('0/1 題 → 至少 1 分鐘', () => { expect(estimateFillMinutes(0)).toBe(1); expect(estimateFillMinutes(1)).toBe(1); });
  it('10 題 → 5 分鐘', () => expect(estimateFillMinutes(10)).toBe(5));
  it('22 題 → 11 分鐘', () => expect(estimateFillMinutes(22)).toBe(11));
  it('四捨五入半分鐘:3 題(1.5)→2、5 題→3、7 題(3.5)→4', () => {
    expect(estimateFillMinutes(3)).toBe(2);
    expect(estimateFillMinutes(5)).toBe(3);
    expect(estimateFillMinutes(7)).toBe(4);
  });
});
