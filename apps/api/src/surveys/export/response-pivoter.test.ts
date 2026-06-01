import { describe, it, expect } from 'vitest';
import {
  sanitizeHeader,
  questionHeaders,
  pivotCell,
  pivotAnswerCells,
  type PivotQuestion,
  type OptionLabelMap,
} from './response-pivoter';

const opts: OptionLabelMap = { o1: '非常滿意', o2: '滿意', o3: '不滿意' };

describe('sanitizeHeader', () => {
  it('去換行/逗號/引號並 trim', () => {
    expect(sanitizeHeader('你的\n意見, 是"什麼"')).toBe('你的 意見  是 什麼');
  });
});

describe('questionHeaders', () => {
  it('Q1_/Q2_ 前綴', () => {
    const qs: PivotQuestion[] = [
      { id: 'a', type: 'text', title: '意見' },
      { id: 'b', type: 'rating', title: '評分' },
    ];
    expect(questionHeaders(qs)).toEqual(['Q1_意見', 'Q2_評分']);
  });
});

describe('pivotCell（題型 handler）', () => {
  const single: PivotQuestion = { id: 'q', type: 'single_choice', title: '' };
  const multi: PivotQuestion = { id: 'q', type: 'multiple_choice', title: '' };
  const rating: PivotQuestion = { id: 'q', type: 'rating', title: '' };
  const text: PivotQuestion = { id: 'q', type: 'text', title: '' };

  it('single_choice → 選項 label', () => {
    expect(pivotCell(single, { questionId: 'q', selectedOptionIds: ['o2'] }, opts)).toBe('滿意');
  });
  it('multiple_choice → label 以 | 串接', () => {
    expect(pivotCell(multi, { questionId: 'q', selectedOptionIds: ['o1', 'o3'] }, opts)).toBe('非常滿意 | 不滿意');
  });
  it('未知 option id → 回退顯示 id', () => {
    expect(pivotCell(single, { questionId: 'q', selectedOptionIds: ['oX'] }, opts)).toBe('oX');
  });
  it('rating → 數字字串（含 0）', () => {
    expect(pivotCell(rating, { questionId: 'q', ratingValue: 4 }, opts)).toBe('4');
    expect(pivotCell(rating, { questionId: 'q', ratingValue: 0 }, opts)).toBe('0');
  });
  it('text → 原文', () => {
    expect(pivotCell(text, { questionId: 'q', textAnswer: 'hello' }, opts)).toBe('hello');
  });
  it('缺答案 → 空字串', () => {
    expect(pivotCell(single, undefined, opts)).toBe('');
    expect(pivotCell(rating, undefined, opts)).toBe('');
  });
  it('未知題型 → fallback', () => {
    const unknown: PivotQuestion = { id: 'q', type: 'mystery', title: '' };
    expect(pivotCell(unknown, { questionId: 'q', textAnswer: 'x' }, opts)).toBe('x');
  });
});

describe('pivotAnswerCells', () => {
  it('依題目順序對齊，缺答案補空', () => {
    const qs: PivotQuestion[] = [
      { id: 'q1', type: 'single_choice', title: '' },
      { id: 'q2', type: 'text', title: '' },
      { id: 'q3', type: 'rating', title: '' },
    ];
    const answers = [
      { questionId: 'q3', ratingValue: 5 },
      { questionId: 'q1', selectedOptionIds: ['o1'] },
    ];
    expect(pivotAnswerCells(qs, answers, opts)).toEqual(['非常滿意', '', '5']);
  });
});
