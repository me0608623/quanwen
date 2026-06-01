import { describe, it, expect } from 'vitest';
import {
  RUSH_TIERS,
  applyRushMultiplier,
  tierExpiresAt,
  type DeadlineTier,
} from './surveys.service';

describe('Rush delivery tier constants (QUA-34)', () => {
  describe('RUSH_TIERS', () => {
    it('has correct multipliers for all tiers', () => {
      expect(RUSH_TIERS.standard.multiplier).toBe(1.00);
      expect(RUSH_TIERS.express.multiplier).toBe(1.20);
      expect(RUSH_TIERS.urgent.multiplier).toBe(1.50);
      expect(RUSH_TIERS.critical.multiplier).toBe(1.75);
    });

    it('has correct deadline days for all tiers', () => {
      expect(RUSH_TIERS.standard.days).toBe(14);
      expect(RUSH_TIERS.express.days).toBe(7);
      expect(RUSH_TIERS.urgent.days).toBe(3);
      expect(RUSH_TIERS.critical.days).toBe(1);
    });
  });

  describe('applyRushMultiplier', () => {
    it('standard: no surcharge (1.0x)', () => {
      expect(applyRushMultiplier(100, 'standard')).toBe(100);
      expect(applyRushMultiplier(0, 'standard')).toBe(0);
    });

    it('express: +20% (1.2x), rounds to integer', () => {
      expect(applyRushMultiplier(100, 'express')).toBe(120);
      expect(applyRushMultiplier(10, 'express')).toBe(12);
      expect(applyRushMultiplier(33, 'express')).toBe(40); // 33 * 1.2 = 39.6 → 40
    });

    it('urgent: +50% (1.5x)', () => {
      expect(applyRushMultiplier(100, 'urgent')).toBe(150);
      expect(applyRushMultiplier(10, 'urgent')).toBe(15);
    });

    it('critical: +75% (1.75x), CEO confirmed rate', () => {
      expect(applyRushMultiplier(100, 'critical')).toBe(175);
      expect(applyRushMultiplier(40, 'critical')).toBe(70); // 40 * 1.75 = 70
    });

    it('zero base points → zero effective points for any tier', () => {
      const tiers: DeadlineTier[] = ['standard', 'express', 'urgent', 'critical'];
      for (const tier of tiers) {
        expect(applyRushMultiplier(0, tier)).toBe(0);
      }
    });
  });

  describe('tierExpiresAt', () => {
    const now = new Date('2026-06-01T00:00:00Z');

    it('standard: expires 14 days from now', () => {
      const result = tierExpiresAt('standard', now);
      const expected = new Date('2026-06-15T00:00:00Z');
      expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it('express: expires 7 days from now', () => {
      const result = tierExpiresAt('express', now);
      const expected = new Date('2026-06-08T00:00:00Z');
      expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it('urgent: expires 3 days from now', () => {
      const result = tierExpiresAt('urgent', now);
      const expected = new Date('2026-06-04T00:00:00Z');
      expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it('critical: expires 1 day from now', () => {
      const result = tierExpiresAt('critical', now);
      const expected = new Date('2026-06-02T00:00:00Z');
      expect(result.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it('uses current time as default when no from date provided', () => {
      const before = new Date();
      const result = tierExpiresAt('standard');
      const after = new Date();
      // Should be 14 days after now
      const minExpected = new Date(before.getTime() + 14 * 24 * 60 * 60 * 1000);
      const maxExpected = new Date(after.getTime() + 14 * 24 * 60 * 60 * 1000);
      expect(result.getTime()).toBeGreaterThanOrEqual(minExpected.getTime() - 1000);
      expect(result.getTime()).toBeLessThanOrEqual(maxExpected.getTime() + 1000);
    });
  });
});
