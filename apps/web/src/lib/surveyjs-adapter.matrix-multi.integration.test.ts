import { Model } from 'survey-core';
import { describe, expect, it } from 'vitest';
import type { PublicQuestion } from '@/hooks/use-responses';
import { extractAnswers, quanswenToSurveyJs } from './surveyjs-adapter';

describe('SurveyJS matrix integration', () => {
  it('round-trips a multi-select matrix through survey-core and extractAnswers', () => {
    const q: PublicQuestion = {
      id: 'matrix_multi',
      type: 'matrix',
      title: '複選矩陣',
      sortOrder: 0,
      isRequired: true,
      options: [],
      config: {
        matrix: {
          rows: ['陳述A', '陳述B'],
          columns: ['不同意', '普通', '同意'],
          multiple: true,
        },
      },
    };

    const surveyJsModel = quanswenToSurveyJs({ questions: [q] });
    const element = surveyJsModel.pages[0].elements[0];

    expect(element.type).toBe('matrixdropdown');
    expect(element.columns).toEqual([
      { name: '不同意', title: '不同意', cellType: 'boolean' },
      { name: '普通', title: '普通', cellType: 'boolean' },
      { name: '同意', title: '同意', cellType: 'boolean' },
    ]);

    const model = new Model(surveyJsModel);
    const surveyQuestion = model.getAllQuestions()[0] as unknown as {
      getType: () => string;
      rows: unknown[];
      columns: unknown[];
    };

    expect(surveyQuestion.getType()).toBe('matrixdropdown');
    expect(surveyQuestion.rows).toHaveLength(2);
    expect(surveyQuestion.columns).toHaveLength(3);

    model.setValue(q.id, {
      陳述A: { 同意: true, 普通: true },
      陳述B: { 不同意: true },
    });

    expect(model.getValue(q.id)).toEqual({
      陳述A: { 同意: true, 普通: true },
      陳述B: { 不同意: true },
    });

    const answers = extractAnswers(model.data, [q]);
    expect(answers).toHaveLength(1);
    expect(answers[0].questionId).toBe(q.id);
    expect(answers[0].textAnswer).toBeTypeOf('string');

    const parsed = JSON.parse(answers[0].textAnswer ?? '{}');
    expect(parsed).toEqual({
      陳述A: { 同意: true, 普通: true },
      陳述B: { 不同意: true },
    });
    expect(parsed['陳述A']['同意']).toBe(true);
    expect(parsed['陳述A']['普通']).toBe(true);
    expect(parsed['陳述B']['不同意']).toBe(true);
  });

  it('builds a single-select matrix control through survey-core', () => {
    const q: PublicQuestion = {
      id: 'matrix_single',
      type: 'matrix',
      title: '單選矩陣',
      sortOrder: 0,
      isRequired: true,
      options: [],
      config: {
        matrix: {
          rows: ['陳述A', '陳述B'],
          columns: ['不同意', '普通', '同意'],
        },
      },
    };

    const surveyJsModel = quanswenToSurveyJs({ questions: [q] });
    const element = surveyJsModel.pages[0].elements[0];

    expect(element.type).toBe('matrix');

    const model = new Model(surveyJsModel);
    const surveyQuestion = model.getAllQuestions()[0] as {
      getType: () => string;
    };

    expect(surveyQuestion.getType()).toBe('matrix');
  });
});
