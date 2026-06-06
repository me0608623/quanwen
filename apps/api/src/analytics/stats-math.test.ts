import { describe, it, expect } from 'vitest';
import {
  welchTTest,
  oneWayAnova,
  multipleLinearRegression,
  tDistTwoTailedP,
  fDistRightTailP,
} from './stats-math';

describe('stats-math', () => {
  it('Welch t-test matches textbook值 (A vs B)', () => {
    const r = welchTTest([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])!;
    expect(r.t).toBeCloseTo(-5, 2);
    expect(r.df).toBeCloseTo(8, 1);
    expect(r.meanDiff).toBeCloseTo(-5, 2);
    expect(r.p).toBeLessThan(0.01);
  });

  it('one-way ANOVA matches hand calc (F=3, df 2/6)', () => {
    const r = oneWayAnova([[1, 2, 3], [2, 3, 4], [3, 4, 5]])!;
    expect(r.f).toBeCloseTo(3, 2);
    expect(r.df1).toBe(2);
    expect(r.df2).toBe(6);
    expect(r.etaSquared).toBeCloseTo(0.5, 2);
  });

  it('regression recovers exact line y = 2x + 1', () => {
    const x = [[1], [2], [3], [4], [5], [6]];
    const y = x.map(([v]) => 2 * v + 1);
    const r = multipleLinearRegression(x, y)!;
    expect(r.intercept).toBeCloseTo(1, 2);
    expect(r.coefficients[1].coefficient).toBeCloseTo(2, 2);
    expect(r.rSquared).toBeCloseTo(1, 3);
  });

  it('multiple regression with two predictors y = 3a - 2b + 5', () => {
    const rows = [[1, 1], [2, 1], [1, 2], [3, 2], [2, 3], [4, 1], [1, 4]];
    const y = rows.map(([a, b]) => 3 * a - 2 * b + 5);
    const r = multipleLinearRegression(rows, y)!;
    expect(r.coefficients[1].coefficient).toBeCloseTo(3, 1);
    expect(r.coefficients[2].coefficient).toBeCloseTo(-2, 1);
    expect(r.rSquared).toBeCloseTo(1, 2);
  });

  it('distribution tails近似已知值', () => {
    // t=2.306, df=8 → two-sided p ≈ 0.05
    expect(tDistTwoTailedP(2.306, 8)).toBeCloseTo(0.05, 2);
    // F=3, df 2/6 → right tail ≈ 0.124
    expect(fDistRightTailP(3, 2, 6)).toBeCloseTo(0.124, 2);
  });

  it('guards insufficient samples', () => {
    expect(welchTTest([1], [2, 3])).toBeNull();
    expect(oneWayAnova([[1, 2]])).toBeNull();
    expect(multipleLinearRegression([[1], [2]], [1, 2])).toBeNull();
  });
});
