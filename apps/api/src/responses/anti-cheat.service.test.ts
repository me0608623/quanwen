import { describe, it, expect, beforeEach } from 'vitest';
import { AntiCheatService } from './anti-cheat.service';
import type { AnswerDto } from './dto/submit-response.dto';

function choice(questionId: string, optionId: string): AnswerDto {
  return { questionId, selectedOptionIds: [optionId] } as AnswerDto;
}

function text(questionId: string, body: string): AnswerDto {
  return { questionId, textAnswer: body } as AnswerDto;
}

describe('AntiCheatService', () => {
  let svc: AntiCheatService;

  beforeEach(() => {
    svc = new AntiCheatService();
  });

  describe('填答速度', () => {
    it('正常速度不扣分', () => {
      const answers = [choice('q1', 'a'), choice('q2', 'b'), choice('q3', 'c')];
      const r = svc.evaluate(answers, 3, 30);
      expect(r.score).toBe(0);
      expect(r.isSuspicious).toBe(false);
    });

    it('極短時間 (<20%) → +50 分', () => {
      const r = svc.evaluate([choice('q1', 'a')], 10, 5);
      expect(r.score).toBeGreaterThanOrEqual(50);
      expect(r.flags.some((f) => f.includes('過短'))).toBe(true);
    });

    it('偏短時間 (20-50%) → +25 分', () => {
      const r = svc.evaluate([choice('q1', 'a')], 10, 12);
      expect(r.score).toBeGreaterThanOrEqual(25);
      expect(r.score).toBeLessThan(50);
      expect(r.flags.some((f) => f.includes('偏短'))).toBe(true);
    });

    it('fillDurationSeconds=null 不檢查時間', () => {
      const answers = Array.from({ length: 5 }, (_, i) => choice(`q${i}`, `opt${i}`));
      const r = svc.evaluate(answers, 5, null);
      expect(r.flags.some((f) => f.includes('時間'))).toBe(false);
    });
  });

  describe('文字題品質', () => {
    it('所有文字題回答過短 → +20', () => {
      const answers = [text('q1', '好'), text('q2', '')];
      const r = svc.evaluate(answers, 2, 60);
      expect(r.score).toBeGreaterThanOrEqual(20);
      expect(r.flags.some((f) => f.includes('文字題'))).toBe(true);
    });

    it('文字題有正常字數 → 不扣分', () => {
      const answers = [text('q1', '我覺得這個調查很有意思')];
      const r = svc.evaluate(answers, 1, 60);
      expect(r.flags.some((f) => f.includes('文字題'))).toBe(false);
    });
  });

  describe('選擇題全選同一選項', () => {
    it('4 題以上全選同一個 → +15', () => {
      const answers = [
        choice('q1', 'optA'),
        choice('q2', 'optA'),
        choice('q3', 'optA'),
        choice('q4', 'optA'),
      ];
      const r = svc.evaluate(answers, 4, 60);
      expect(r.score).toBeGreaterThanOrEqual(15);
      expect(r.flags.some((f) => f.includes('同一選項'))).toBe(true);
    });

    it('3 題全選同一個 → 不觸發（需 ≥4）', () => {
      const answers = [
        choice('q1', 'optA'),
        choice('q2', 'optA'),
        choice('q3', 'optA'),
      ];
      const r = svc.evaluate(answers, 3, 60);
      expect(r.flags.some((f) => f.includes('同一選項'))).toBe(false);
    });

    it('選項分散 → 不觸發', () => {
      const answers = [
        choice('q1', 'optA'),
        choice('q2', 'optB'),
        choice('q3', 'optA'),
        choice('q4', 'optC'),
      ];
      const r = svc.evaluate(answers, 4, 60);
      expect(r.flags.some((f) => f.includes('同一選項'))).toBe(false);
    });
  });

  describe('回答數量不足', () => {
    it('回答數遠少於總題數 → +15', () => {
      const r = svc.evaluate([choice('q1', 'a')], 10, 60);
      expect(r.score).toBeGreaterThanOrEqual(15);
      expect(r.flags.some((f) => f.includes('遠少於'))).toBe(true);
    });

    it('回答完整 → 不觸發', () => {
      const answers = Array.from({ length: 5 }, (_, i) => choice(`q${i}`, `opt${i}`));
      const r = svc.evaluate(answers, 5, 60);
      expect(r.flags.some((f) => f.includes('遠少於'))).toBe(false);
    });
  });

  describe('綜合判定', () => {
    it('score ≥ 60 標記 isSuspicious', () => {
      const answers = [choice('q1', 'a')];
      const r = svc.evaluate(answers, 10, 1);
      expect(r.score).toBeGreaterThanOrEqual(60);
      expect(r.isSuspicious).toBe(true);
    });

    it('score 最高 100，不會超過', () => {
      const answers = [
        text('q1', ''),
        text('q2', ''),
        choice('q3', 'a'),
        choice('q4', 'a'),
        choice('q5', 'a'),
        choice('q6', 'a'),
      ];
      const r = svc.evaluate(answers, 20, 1);
      expect(r.score).toBeLessThanOrEqual(100);
    });

    it('完全乾淨 → score 0', () => {
      const answers = [
        text('q1', '我覺得這份問卷設計得不錯，很有意思'),
        choice('q2', 'optA'),
        choice('q3', 'optB'),
      ];
      const r = svc.evaluate(answers, 3, 60);
      expect(r.score).toBe(0);
      expect(r.isSuspicious).toBe(false);
      expect(r.flags).toHaveLength(0);
    });
  });
});
