import { describe, expect, it } from 'vitest';
import { calculateReversePairConsistency } from './quality-audit.service';

describe('calculateReversePairConsistency', () => {
  it('scores consistent one-based and zero-based reverse pairs equally', () => {
    expect(calculateReversePairConsistency([
      { a: 1, b: 5, minRating: 1, maxRating: 5 },
      { a: 4, b: 2, minRating: 1, maxRating: 5 },
    ])).toBe(100);
    expect(calculateReversePairConsistency([
      { a: 0, b: 5, minRating: 0, maxRating: 5 },
      { a: 4, b: 1, minRating: 0, maxRating: 5 },
    ])).toBe(100);
  });

  it('returns null without pairs and lowers the score for inconsistent answers', () => {
    expect(calculateReversePairConsistency([])).toBeNull();
    expect(calculateReversePairConsistency([
      { a: 0, b: 0, minRating: 0, maxRating: 5 },
    ])).toBe(0);
  });
});
