/**
 * Phase II.12: AI 生成問卷 parse + normalize
 *
 * 重點測 normalize 把「LLM 髒輸出」修成可存 DB 的乾淨結構。
 */
import { describe, it, expect } from 'vitest';
import { parseAiSurveyDraft, normalizeSurveyDraft } from './survey-draft';

describe('parseAiSurveyDraft (lenient)', () => {
  it('合法輸入通過', () => {
    const r = parseAiSurveyDraft({
      title: '咖啡消費調查',
      description: '了解你的咖啡習慣',
      questions: [{ type: 'single_choice', title: '多常喝', options: [{ label: '每天' }] }],
    });
    expect(r.title).toBe('咖啡消費調查');
    expect(r.questions).toHaveLength(1);
  });

  it('未知 type → catch 成 text', () => {
    const r = parseAiSurveyDraft({ questions: [{ type: '排序題', title: 'x' }] });
    expect(r.questions?.[0]?.type).toBe('text');
  });

  it('option 給字串而非 {label} → 轉成 {label}', () => {
    const r = parseAiSurveyDraft({
      questions: [{ type: 'single_choice', title: 'x', options: ['A', 'B'] }],
    });
    const opts = r.questions?.[0]?.options;
    expect(opts?.[0]).toEqual({ label: 'A' });
  });

  it('全空物件不 throw', () => {
    expect(() => parseAiSurveyDraft({})).not.toThrow();
  });
});

describe('normalizeSurveyDraft', () => {
  it('1. 缺 title → 預設值 + note', () => {
    const r = normalizeSurveyDraft({ questions: [] });
    expect(r.title).toBe('未命名問卷');
    expect(r.notes.some((n) => n.includes('標題'))).toBe(true);
  });

  it('2. single_choice 選項不足 2 → 降級為 text + note', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'single_choice', title: '你喜歡嗎', options: [{ label: '喜歡' }] }],
    });
    expect(r.questions[0]?.type).toBe('text');
    expect(r.notes.some((n) => n.includes('選項不足'))).toBe(true);
  });

  it('3. single_choice 選項足夠 → 保留，sortOrder 連續', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [
        {
          type: 'single_choice',
          title: '頻率',
          options: [{ label: '每天' }, { label: '每週' }, { label: '偶爾' }],
        },
      ],
    });
    expect(r.questions[0]?.type).toBe('single_choice');
    expect(r.questions[0]?.options).toHaveLength(3);
    expect(r.questions[0]?.options?.map((o) => o.sortOrder)).toEqual([0, 1, 2]);
  });

  it('4. 選項去重（大小寫不敏感）', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [
        {
          type: 'multiple_choice',
          title: 'x',
          options: [{ label: '咖啡' }, { label: '咖啡' }, { label: '茶' }],
        },
      ],
    });
    expect(r.questions[0]?.options).toHaveLength(2);
  });

  it('5. 選項超過上限 8 → 截斷', () => {
    const opts = Array.from({ length: 12 }, (_, i) => ({ label: `選項${i}` }));
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'single_choice', title: 'x', options: opts }],
    });
    expect(r.questions[0]?.options?.length).toBe(8);
  });

  it('6. rating 缺 maxRating → 補 5', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'rating', title: '滿意度' }],
    });
    expect(r.questions[0]?.type).toBe('rating');
    expect(r.questions[0]?.config).toEqual({ maxRating: 5 });
  });

  it('7. rating maxRating 出界 → 補 5', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'rating', title: 'x', config: { maxRating: 99 } }],
    });
    expect(r.questions[0]?.config).toEqual({ maxRating: 5 });
  });

  it('8. rating maxRating 合法（7）→ 保留', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'rating', title: 'x', config: { maxRating: 7 } }],
    });
    expect(r.questions[0]?.config).toEqual({ maxRating: 7 });
  });

  it('9. text 題不應帶 options', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'text', title: '建議', options: [{ label: '不該在這' }] }],
    });
    expect(r.questions[0]?.type).toBe('text');
    expect(r.questions[0]?.options).toBeUndefined();
  });

  it('10. 空 title 題目被略過 + note', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [
        { type: 'text', title: '   ' },
        { type: 'text', title: '有效題' },
      ],
    });
    expect(r.questions).toHaveLength(1);
    expect(r.notes.some((n) => n.includes('題目文字為空'))).toBe(true);
  });

  it('11. 題數超過 maxQuestions → 截斷 + note', () => {
    const qs = Array.from({ length: 30 }, (_, i) => ({ type: 'text' as const, title: `Q${i}` }));
    const r = normalizeSurveyDraft({ title: 't', questions: qs }, { maxQuestions: 5 });
    expect(r.questions).toHaveLength(5);
    expect(r.notes.some((n) => n.includes('截斷'))).toBe(true);
  });

  it('12. matrix 結構不完整 → 降級為 single_choice + note', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'matrix', title: '評比', options: [{ label: 'A' }, { label: 'B' }] }],
    });
    // matrix 降級後變 single_choice（有 2 選項剛好夠）
    expect(['single_choice', 'text']).toContain(r.questions[0]?.type);
    expect(r.notes.some((n) => n.includes('matrix') || n.includes('降級'))).toBe(true);
  });

  it('13. 全部題目無效 → notes 提示重試', () => {
    const r = normalizeSurveyDraft({ title: 't', questions: [{ type: 'text', title: '' }] });
    expect(r.questions).toHaveLength(0);
    expect(r.notes.some((n) => n.includes('沒有生成任何有效題目'))).toBe(true);
  });

  it('14. 整合：髒輸入 → 全部修乾淨', () => {
    const r = normalizeSurveyDraft({
      title: '  顧客滿意度  ',
      questions: [
        { type: 'single_choice', title: '性別', options: [{ label: '男' }, { label: '女' }] },
        { type: 'rating', title: '整體滿意度', config: {} },
        { type: 'single_choice', title: '壞題', options: [{ label: '只有一個' }] }, // → text
        { type: 'text', title: '建議' },
      ],
    });
    expect(r.title).toBe('顧客滿意度'); // trim
    expect(r.questions).toHaveLength(4);
    expect(r.questions[0]?.type).toBe('single_choice');
    expect(r.questions[1]?.config).toEqual({ maxRating: 5 });
    expect(r.questions[2]?.type).toBe('text'); // 降級
    expect(r.questions[3]?.type).toBe('text');
    // sortOrder 連續
    expect(r.questions.map((q) => q.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('15. scale_agreement → rating + 固定同意度錨點(0~5)', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'scale_agreement', title: '我認為此服務值得推薦' }],
    });
    expect(r.questions[0]?.type).toBe('rating');
    expect(r.questions[0]?.config).toEqual({
      maxRating: 5,
      scaleStart: 0,
      minLabel: '非常不同意',
      maxLabel: '非常同意',
    });
  });

  it('16. scale_frequency → rating + 固定頻率錨點(0~5)', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [{ type: 'scale_frequency', title: '我每天使用此工具' }],
    });
    expect(r.questions[0]?.type).toBe('rating');
    expect(r.questions[0]?.config).toEqual({
      maxRating: 5,
      scaleStart: 0,
      minLabel: '從來沒有',
      maxLabel: '總是如此',
    });
  });

  it('17. rating 帶 AI 給的 minLabel/maxLabel/scaleStart → 保留', () => {
    const r = normalizeSurveyDraft({
      title: 't',
      questions: [
        {
          type: 'rating',
          title: '客製量表',
          config: { maxRating: 5, scaleStart: 0, minLabel: '極低', maxLabel: '極高' },
        },
      ],
    });
    expect(r.questions[0]?.config).toEqual({
      maxRating: 5,
      scaleStart: 0,
      minLabel: '極低',
      maxLabel: '極高',
    });
  });
});
