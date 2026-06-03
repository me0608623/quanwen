import { describe, expect, it } from 'vitest';
import { calculateCronbachAlpha, calculatePearsonCorrelation, normalizeScaleValue, ratingScaleRange, reverseScaleValue, withReverseScored } from './analytics.service';

describe('calculateCronbachAlpha', () => {
  it('returns a high alpha for internally consistent rating rows', () => {
    expect(calculateCronbachAlpha([
      [1, 1, 2],
      [2, 2, 3],
      [3, 3, 4],
      [4, 4, 5],
    ])).toBeGreaterThan(0.9);
  });

  it('returns null when the scale has fewer than two items or no variance', () => {
    expect(calculateCronbachAlpha([[1], [2]])).toBeNull();
    expect(calculateCronbachAlpha([[3, 3], [3, 3]])).toBeNull();
  });
});

describe('reverseScaleValue', () => {
  it('reverses both 1-5 and 0-5 scales', () => {
    expect(reverseScaleValue(1, 1, 5)).toBe(5);
    expect(reverseScaleValue(5, 1, 5)).toBe(1);
    expect(reverseScaleValue(0, 0, 5)).toBe(5);
    expect(reverseScaleValue(4, 0, 5)).toBe(1);
  });
});

describe('normalizeScaleValue', () => {
  it('maps different rating ranges to a common zero-to-one scale', () => {
    expect(normalizeScaleValue(3, 1, 5)).toBe(0.5);
    expect(normalizeScaleValue(3.5, 0, 7)).toBe(0.5);
  });
});

describe('ratingScaleRange', () => {
  it('clamps legacy malformed configs to the supported range', () => {
    expect(ratingScaleRange({ maxRating: 99, scaleStart: 0 })).toEqual({ min: 0, max: 10 });
    expect(ratingScaleRange({ maxRating: -2 })).toEqual({ min: 1, max: 2 });
  });
});

describe('withReverseScored', () => {
  it('preserves existing rating config when updating the persisted reverse flag', () => {
    expect(withReverseScored({ maxRating: 7, scaleStart: 0 }, true)).toEqual({
      maxRating: 7,
      scaleStart: 0,
      reverseScored: true,
    });
  });
});

describe('calculatePearsonCorrelation', () => {
  it('returns a rounded positive or negative correlation', () => {
    expect(calculatePearsonCorrelation([1, 2, 3], [2, 4, 6])).toBe(1);
    expect(calculatePearsonCorrelation([1, 2, 3], [6, 4, 2])).toBe(-1);
  });

  it('returns null when values cannot produce a correlation', () => {
    expect(calculatePearsonCorrelation([1], [1])).toBeNull();
    expect(calculatePearsonCorrelation([1, 1], [2, 3])).toBeNull();
    expect(calculatePearsonCorrelation([1, 2], [2])).toBeNull();
  });
});
