import { describe, it, expect } from 'vitest';
import { isPlaceholderEmail } from './use-auth';

describe('isPlaceholderEmail', () => {
  it('flags LINE / Apple placeholder emails', () => {
    expect(isPlaceholderEmail('u123@line.placeholder')).toBe(true);
    expect(isPlaceholderEmail('abc@apple.placeholder')).toBe(true);
  });

  it('does not flag real emails', () => {
    expect(isPlaceholderEmail('user@quanwen.com')).toBe(false);
    expect(isPlaceholderEmail('a@gmail.com')).toBe(false);
  });

  it('handles empty / undefined safely', () => {
    expect(isPlaceholderEmail(undefined)).toBe(false);
    expect(isPlaceholderEmail('')).toBe(false);
  });
});
