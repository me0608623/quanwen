import { describe, expect, it } from 'vitest';
import { evaluateSkipLogic, describeSkipLogic } from './skip-logic';
import type { SkipLogicRule } from '@/hooks/use-surveys';

describe('skip-logic (Phase G.1)', () => {
  describe('evaluateSkipLogic', () => {
    it('returns next index when no rules', () => {
      const r = evaluateSkipLogic(2, undefined, { selectedOptionIds: ['x'] });
      expect(r).toEqual({ nextIndex: 3, triggered: false });
    });

    it('returns next index when rules array is empty', () => {
      const r = evaluateSkipLogic(2, { skipLogic: [] }, { selectedOptionIds: ['x'] });
      expect(r).toEqual({ nextIndex: 3, triggered: false });
    });

    it('triggers skipToEnd when selectedOptionId matches', () => {
      const rules: SkipLogicRule[] = [{ selectedOptionId: 'opt-1', skipToEnd: true }];
      const r = evaluateSkipLogic(0, { skipLogic: rules }, { selectedOptionIds: ['opt-1'] });
      expect(r.nextIndex).toBe(-1);
      expect(r.triggered).toBe(true);
      expect(r.reason).toBe('skip_to_end');
    });

    it('triggers skipToQuestionIndex when selectedOptionId matches', () => {
      const rules: SkipLogicRule[] = [{ selectedOptionId: 'opt-2', skipToQuestionIndex: 5 }];
      const r = evaluateSkipLogic(1, { skipLogic: rules }, { selectedOptionIds: ['opt-2'] });
      expect(r.nextIndex).toBe(5);
      expect(r.triggered).toBe(true);
    });

    it('does not trigger if selected option differs', () => {
      const rules: SkipLogicRule[] = [{ selectedOptionId: 'opt-1', skipToEnd: true }];
      const r = evaluateSkipLogic(0, { skipLogic: rules }, { selectedOptionIds: ['opt-99'] });
      expect(r.nextIndex).toBe(1);
      expect(r.triggered).toBe(false);
    });

    it('triggers on rating value match', () => {
      const rules: SkipLogicRule[] = [{ selectedRating: 1, skipToQuestionIndex: 10 }];
      const r = evaluateSkipLogic(3, { skipLogic: rules }, { ratingValue: 1 });
      expect(r.nextIndex).toBe(10);
      expect(r.triggered).toBe(true);
    });

    it('processes first matching rule when multiple', () => {
      const rules: SkipLogicRule[] = [
        { selectedOptionId: 'a', skipToEnd: true },
        { selectedOptionId: 'b', skipToQuestionIndex: 5 },
      ];
      const r = evaluateSkipLogic(0, { skipLogic: rules }, { selectedOptionIds: ['b'] });
      expect(r.nextIndex).toBe(5);
    });
  });

  describe('describeSkipLogic', () => {
    it('returns empty string for no rules', () => {
      expect(describeSkipLogic(undefined, new Map())).toBe('');
      expect(describeSkipLogic([], new Map())).toBe('');
    });

    it('formats single rule with skipToEnd', () => {
      const out = describeSkipLogic(
        [{ selectedOptionId: 'opt-1', skipToEnd: true }],
        new Map([['opt-1', '不適用']]),
      );
      expect(out).toBe('若 選「不適用」 → 結束問卷');
    });

    it('formats single rule with skipToQuestionIndex', () => {
      const out = describeSkipLogic(
        [{ selectedOptionId: 'opt-2', skipToQuestionIndex: 4 }],
        new Map([['opt-2', '同意']]),
      );
      expect(out).toBe('若 選「同意」 → 跳到 Q5');
    });

    it('joins multiple rules with semicolon', () => {
      const out = describeSkipLogic(
        [
          { selectedOptionId: 'a', skipToEnd: true },
          { selectedRating: 1, skipToQuestionIndex: 3 },
        ],
        new Map([['a', '選項一']]),
      );
      expect(out).toContain('；');
      expect(out).toContain('選「選項一」');
      expect(out).toContain('評 1 分');
    });
  });
});
