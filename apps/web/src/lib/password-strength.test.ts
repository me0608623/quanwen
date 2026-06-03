import { describe, expect, it } from 'vitest';
import { passwordStrength } from './password-strength';

describe('passwordStrength', () => {
  it('空 → 0', () => expect(passwordStrength('').score).toBe(0));
  it('短弱', () => expect(passwordStrength('abc').score).toBeLessThanOrEqual(1));
  it('強密碼 → 高分', () => {
    const s = passwordStrength('Abcdef123!xyz');
    expect(s.score).toBe(4);
    expect(s.label).toBe('很強');
  });
  it('中等', () => {
    const s = passwordStrength('Abcdef12');
    expect(s.score).toBeGreaterThanOrEqual(2);
    expect(s.score).toBeLessThanOrEqual(3);
  });
});
