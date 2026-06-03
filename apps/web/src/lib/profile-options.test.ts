import { describe, it, expect } from 'vitest';
import {
  AGE_RANGE_OPTIONS,
  AGE_RANGE_LABELS,
  GENDER_OPTIONS,
  GENDER_LABELS,
  TW_REGIONS,
  REGION_OPTIONS,
} from './profile-options';

describe('profile-options label maps', () => {
  it('derives AGE_RANGE_LABELS from AGE_RANGE_OPTIONS (single source of truth)', () => {
    expect(Object.keys(AGE_RANGE_LABELS).sort()).toEqual(
      AGE_RANGE_OPTIONS.map((o) => o.value).sort(),
    );
    for (const o of AGE_RANGE_OPTIONS) {
      expect(AGE_RANGE_LABELS[o.value]).toBe(o.label);
    }
  });

  it('derives GENDER_LABELS correctly', () => {
    for (const o of GENDER_OPTIONS) {
      expect(GENDER_LABELS[o.value]).toBe(o.label);
    }
  });

  it('builds REGION_OPTIONS where value equals label for every region', () => {
    expect(REGION_OPTIONS).toHaveLength(TW_REGIONS.length);
    for (const opt of REGION_OPTIONS) {
      expect(opt.value).toBe(opt.label);
      expect(TW_REGIONS).toContain(opt.value);
    }
  });
});
