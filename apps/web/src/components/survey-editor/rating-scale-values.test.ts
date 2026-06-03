import { describe, it, expect } from 'vitest';
import { ratingScaleValues } from './rating-scale';

describe('ratingScaleValues', () => {
  it('defaults to 1..5', () => {
    expect(ratingScaleValues()).toEqual([1, 2, 3, 4, 5]);
    expect(ratingScaleValues({})).toEqual([1, 2, 3, 4, 5]);
  });

  it('honours maxRating', () => {
    expect(ratingScaleValues({ maxRating: 7 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts at 0 when scaleStart is 0 (academic scale)', () => {
    expect(ratingScaleValues({ scaleStart: 0, maxRating: 5 })).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('clamps maxRating to [2, 10]', () => {
    expect(ratingScaleValues({ maxRating: 100 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ratingScaleValues({ maxRating: 1 })).toEqual([1, 2]);
  });

  it('rounds fractional maxRating', () => {
    expect(ratingScaleValues({ maxRating: 4.6 })).toEqual([1, 2, 3, 4, 5]);
  });
});
