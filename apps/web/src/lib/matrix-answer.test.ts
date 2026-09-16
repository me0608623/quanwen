import { describe, expect, it } from 'vitest';
import {
  isMatrixAnswerComplete,
  matrixConfigParts,
  matrixRowSelectionLabel,
  parseMatrixAnswer,
  serializeMatrixAnswer,
} from './matrix-answer';

describe('matrix-answer', () => {
  it('reads matrix config parts', () => {
    expect(
      matrixConfigParts({
        matrix: { rows: ['A', ''], columns: ['同意', '不同意'], multiple: true },
      }),
    ).toEqual({
      rows: ['A'],
      columns: ['同意', '不同意'],
      multiple: true,
    });
  });

  it('parses single-select JSON', () => {
    const v = parseMatrixAnswer('{"陳述1":"同意","陳述2":"不同意"}', false);
    expect(v).toEqual({ 陳述1: '同意', 陳述2: '不同意' });
  });

  it('parses SurveyJS multi boolean map', () => {
    const v = parseMatrixAnswer(
      JSON.stringify({ 陳述A: { 同意: true, 普通: true }, 陳述B: { 不同意: true } }),
      true,
    );
    expect(v).toEqual({ 陳述A: ['同意', '普通'], 陳述B: ['不同意'] });
  });

  it('round-trips serialize/parse for multi', () => {
    const ui = { 陳述A: ['同意', '普通'], 陳述B: ['不同意'] };
    const raw = serializeMatrixAnswer(ui, true);
    expect(JSON.parse(raw)).toEqual({
      陳述A: { 同意: true, 普通: true },
      陳述B: { 不同意: true },
    });
    expect(parseMatrixAnswer(raw, true)).toEqual(ui);
  });

  it('checks completeness', () => {
    expect(isMatrixAnswerComplete({ A: '同意' }, ['A', 'B'], false)).toBe(false);
    expect(isMatrixAnswerComplete({ A: '同意', B: '不同意' }, ['A', 'B'], false)).toBe(true);
    expect(isMatrixAnswerComplete({ A: ['同意'] }, ['A'], true)).toBe(true);
    expect(isMatrixAnswerComplete({ A: [] }, ['A'], true)).toBe(false);
  });

  it('formats row selection label', () => {
    expect(matrixRowSelectionLabel({ A: '同意' }, 'A')).toBe('同意');
    expect(matrixRowSelectionLabel({ A: ['同意', '普通'] }, 'A')).toBe('同意、普通');
    expect(matrixRowSelectionLabel({}, 'A')).toBe('—');
  });

  it('returns empty on invalid JSON', () => {
    expect(parseMatrixAnswer('not-json')).toEqual({});
    expect(parseMatrixAnswer(null)).toEqual({});
  });
});
