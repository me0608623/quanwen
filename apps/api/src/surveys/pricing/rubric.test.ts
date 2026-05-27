import { describe, it, expect } from 'vitest';
import {
  estimateRubricBase,
  estimateQuestionSeconds,
  type RubricQuestion,
} from './rubric';

const q = (type: string, extra: Partial<RubricQuestion> = {}): RubricQuestion => ({
  type,
  isRequired: true,
  ...extra,
});

describe('estimateQuestionSeconds', () => {
  it('單選題 = 6 秒', () => {
    expect(estimateQuestionSeconds(q('single_choice'))).toBe(6);
  });

  it('多選題 = 12 秒（含 DTO 別名 multiple_choice）', () => {
    expect(estimateQuestionSeconds(q('multi_choice'))).toBe(12);
    expect(estimateQuestionSeconds(q('multiple_choice'))).toBe(12);
  });

  it('長問答 = 120 秒', () => {
    expect(estimateQuestionSeconds(q('open_long'))).toBe(120);
  });

  it('開放題達最低字數 → 1.5 倍寫作負擔', () => {
    expect(estimateQuestionSeconds(q('open_short', { config: { minLength: 50 } }))).toBe(67.5);
    // 未達門檻不加倍
    expect(estimateQuestionSeconds(q('open_short', { config: { minLength: 10 } }))).toBe(45);
  });

  it('矩陣題 = 6 秒 × 列數（config.rows 優先，否則用 options 數）', () => {
    expect(estimateQuestionSeconds(q('matrix', { config: { rows: 5 } }))).toBe(30);
    expect(
      estimateQuestionSeconds(q('matrix', { options: [{}, {}, {}] })),
    ).toBe(18);
  });

  it('排序題 = 5 秒 × 選項數', () => {
    expect(
      estimateQuestionSeconds(q('rank', { options: [{}, {}, {}, {}] })),
    ).toBe(20);
  });

  it('內嵌影片：全額計入觀看秒數', () => {
    expect(
      estimateQuestionSeconds(q('single_choice', { config: { mediaWatchSec: 60 } })),
    ).toBe(66);
  });

  it('選填題以半權重計', () => {
    expect(estimateQuestionSeconds(q('multi_choice', { isRequired: false }))).toBe(6);
  });

  it('未知題型 → 保守預設 30 秒', () => {
    expect(estimateQuestionSeconds(q('mystery_type'))).toBe(30);
  });
});

describe('estimateRubricBase', () => {
  it('空問卷 → NT$0', () => {
    expect(estimateRubricBase([]).baseRewardNt).toBe(0);
  });

  it('單一單選題 → 6 秒 → 無條件進位 NT$1', () => {
    expect(estimateRubricBase([q('single_choice')]).baseRewardNt).toBe(1);
  });

  it('10 題單選 → 60 秒 = 1 分 → NT$3', () => {
    const questions = Array.from({ length: 10 }, () => q('single_choice'));
    expect(estimateRubricBase(questions).baseRewardNt).toBe(3);
  });

  it('前言閱讀字數併入總秒數', () => {
    const r = estimateRubricBase([q('single_choice')], { introChars: 50 });
    // 6 + 50/5(=10) = 16 秒
    expect(r.totalSeconds).toBe(16);
    expect(r.baseRewardNt).toBe(1);
  });

  it('設計文件 §4 範例：10 單選 + 3 多選 + 2 簡答(≥50字) + 1 段 60 秒影片題 ≈ NT$15', () => {
    const questions: RubricQuestion[] = [
      ...Array.from({ length: 10 }, () => q('single_choice')),
      ...Array.from({ length: 3 }, () => q('multi_choice')),
      ...Array.from({ length: 2 }, () => q('open_short', { config: { minLength: 50 } })),
      q('single_choice', { config: { mediaWatchSec: 60 } }),
    ];
    const r = estimateRubricBase(questions);
    // 60 + 36 + 135 + 66 = 297 秒 → round(297*5)=1485 cent → ceil(14.85)=15
    expect(r.totalSeconds).toBe(297);
    expect(r.baseRewardNt).toBe(15);
  });

  it('回傳每題拆解明細', () => {
    const r = estimateRubricBase([q('single_choice'), q('open_long')]);
    expect(r.perQuestion).toEqual([
      { type: 'single_choice', seconds: 6 },
      { type: 'open_long', seconds: 120 },
    ]);
  });
});
