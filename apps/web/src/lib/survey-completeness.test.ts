import { describe, expect, it } from 'vitest';
import {
  firstCompletenessMessage,
  validateSurveyForPublish,
  validateSurveyQuestions,
} from './survey-completeness';

describe('validateSurveyQuestions', () => {
  it('flags empty titles and thin choice options', () => {
    const issues = validateSurveyQuestions([
      { type: 'single_choice', title: '  ', options: [{ label: 'A' }] },
      { type: 'multiple_choice', title: 'Q2', options: [{ label: 'A' }, { label: '' }] },
    ]);
    expect(issues.some((i) => i.message.includes('題目標題'))).toBe(true);
    expect(issues.some((i) => i.message.includes('至少需要 2 個選項'))).toBe(true);
    expect(issues.some((i) => i.message.includes('選項 2'))).toBe(true);
  });

  it('flags incomplete matrix rows/columns', () => {
    const issues = validateSurveyQuestions([
      {
        type: 'matrix',
        title: '矩陣',
        config: { matrix: { rows: [''], columns: ['同意'] } },
      },
    ]);
    expect(issues.some((i) => i.message.includes('量表選項'))).toBe(true);
    expect(issues.some((i) => i.message.includes('陳述'))).toBe(true);
  });

  it('passes a complete choice question', () => {
    expect(
      validateSurveyQuestions([
        {
          type: 'single_choice',
          title: '性別',
          options: [{ label: '男' }, { label: '女' }],
        },
      ]),
    ).toEqual([]);
  });
});

describe('validateSurveyForPublish', () => {
  it('requires title and questions', () => {
    const issues = validateSurveyForPublish({ title: '', questions: [] });
    expect(firstCompletenessMessage(issues)).toBe('請填寫問卷標題後再發布');
    expect(issues.some((i) => i.message.includes('至少需要一道題目'))).toBe(true);
  });

  it('skips question checks for external surveys', () => {
    expect(validateSurveyForPublish({ title: '外部', questions: [], isExternal: true })).toEqual([]);
  });
});
