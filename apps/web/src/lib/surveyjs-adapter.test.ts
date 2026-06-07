import { describe, expect, it } from 'vitest';
import { quanswenToSurveyJs, extractAnswers, buildVisibleIfExpression, buildVideoEmbedUrl } from './surveyjs-adapter';
import type { PublicQuestion } from '@/hooks/use-responses';

const baseQuestion: PublicQuestion = {
  id: 'q1',
  type: 'single_choice',
  title: 'Pick one',
  sortOrder: 0,
  isRequired: true,
  options: [
    { id: 'opt-a', label: 'Option A', sortOrder: 0 },
    { id: 'opt-b', label: 'Option B', sortOrder: 1 },
  ],
};

describe('quanswenToSurveyJs', () => {
  it('converts a single_choice question to radiogroup', () => {
    const model = quanswenToSurveyJs({
      title: 'Test Survey',
      questions: [baseQuestion],
    });
    expect(model.title).toBe('Test Survey');
    expect(model.pages).toHaveLength(1);
    const q = model.pages[0].elements[0];
    expect(q.name).toBe('q1');
    expect(q.type).toBe('radiogroup');
    expect(q.isRequired).toBe(true);
    expect(q.choices).toEqual([
      { value: 'opt-a', text: 'Option A' },
      { value: 'opt-b', text: 'Option B' },
    ]);
  });

  it('converts yes_no variant to boolean', () => {
    const q: PublicQuestion = {
      ...baseQuestion,
      config: { variant: 'yes_no' },
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    const el = model.pages[0].elements[0];
    expect(el.type).toBe('boolean');
    expect(el.labelTrue).toBe('是');
    expect(el.labelFalse).toBe('否');
  });

  it('converts dropdown variant', () => {
    const q: PublicQuestion = {
      ...baseQuestion,
      config: { renderAs: 'dropdown' },
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    expect(model.pages[0].elements[0].type).toBe('dropdown');
  });

  it('converts multiple_choice to checkbox', () => {
    const q: PublicQuestion = { ...baseQuestion, type: 'multiple_choice' };
    const model = quanswenToSurveyJs({ questions: [q] });
    expect(model.pages[0].elements[0].type).toBe('checkbox');
  });

  it('converts text to comment', () => {
    const q: PublicQuestion = {
      id: 'q2',
      type: 'text',
      title: 'Your thoughts',
      sortOrder: 0,
      isRequired: false,
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    expect(model.pages[0].elements[0].type).toBe('comment');
  });

  it('converts numeric config to number input', () => {
    const q: PublicQuestion = {
      id: 'q3',
      type: 'text',
      title: 'Age',
      sortOrder: 0,
      isRequired: true,
      config: { inputType: 'numeric' },
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    const el = model.pages[0].elements[0];
    expect(el.type).toBe('text');
    expect(el.inputType).toBe('number');
  });

  it('converts rating with maxRating config', () => {
    const q: PublicQuestion = {
      id: 'q4',
      type: 'rating',
      title: 'Rate us',
      sortOrder: 0,
      isRequired: true,
      config: { maxRating: 7 },
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    const el = model.pages[0].elements[0];
    expect(el.type).toBe('rating');
    expect(el.rateMax).toBe(7);
    expect(el.rateMin).toBe(1);
  });

  it('converts rating with default maxRating=5', () => {
    const q: PublicQuestion = {
      id: 'q5',
      type: 'rating',
      title: 'Rate',
      sortOrder: 0,
      isRequired: false,
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    expect(model.pages[0].elements[0].rateMax).toBe(5);
  });

  it('converts a zero-based rating scale', () => {
    const q: PublicQuestion = {
      id: 'q-zero',
      type: 'rating',
      title: 'Rate from zero',
      sortOrder: 0,
      isRequired: true,
      config: { maxRating: 5, scaleStart: 0 },
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    expect(model.pages[0].elements[0].rateMin).toBe(0);
  });

  it('converts matrix question', () => {
    const q: PublicQuestion = {
      id: 'q6',
      type: 'matrix',
      title: 'Matrix Q',
      sortOrder: 0,
      isRequired: true,
      config: {
        matrix: {
          rows: ['Row 1', 'Row 2'],
          columns: ['Col A', 'Col B'],
        },
      },
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    const el = model.pages[0].elements[0];
    expect(el.type).toBe('matrix');
    expect(el.rows).toEqual([
      { value: 'Row 1', text: 'Row 1' },
      { value: 'Row 2', text: 'Row 2' },
    ]);
    expect(el.columns).toEqual([
      { value: 'Col A', text: 'Col A' },
      { value: 'Col B', text: 'Col B' },
    ]);
  });

  it('converts multi-select matrix to matrixdropdown with boolean columns', () => {
    const q: PublicQuestion = {
      id: 'q6m',
      type: 'matrix',
      title: 'Multi Matrix',
      sortOrder: 0,
      isRequired: true,
      config: {
        matrix: {
          rows: ['Row 1', 'Row 2'],
          columns: ['Col A', 'Col B'],
          multiple: true,
        },
      },
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    const el = model.pages[0].elements[0];
    expect(el.type).toBe('matrixdropdown');
    expect(el.rows).toEqual([
      { value: 'Row 1', text: 'Row 1' },
      { value: 'Row 2', text: 'Row 2' },
    ]);
    expect(el.columns).toEqual([
      { name: 'Col A', title: 'Col A', cellType: 'boolean' },
      { name: 'Col B', title: 'Col B', cellType: 'boolean' },
    ]);
  });

  it('falls back to comment for unconfigured matrix', () => {
    const q: PublicQuestion = {
      id: 'q7',
      type: 'matrix',
      title: 'Bad matrix',
      sortOrder: 0,
      isRequired: false,
      options: [],
    };
    const model = quanswenToSurveyJs({ questions: [q] });
    expect(model.pages[0].elements[0].type).toBe('comment');
  });

  it('sets showProgressBar and progressBarType', () => {
    const model = quanswenToSurveyJs({ questions: [baseQuestion] });
    expect(model.showProgressBar).toBe('top');
    expect(model.progressBarType).toBe('questions');
  });

  it('maps single-choice skip logic into visibleIf for skipped questions', () => {
    const questions: PublicQuestion[] = [
      {
        ...baseQuestion,
        id: 'q1',
        config: {
          skipLogic: [{ selectedOptionId: 'opt-a', skipToQuestionIndex: 2 }],
        },
      },
      { ...baseQuestion, id: 'q2', title: 'Q2' },
      { ...baseQuestion, id: 'q3', title: 'Q3' },
    ];
    const model = quanswenToSurveyJs({ questions });
    expect(model.pages[0].elements[1].visibleIf).toBe("!({q1} = 'opt-a')");
    expect(model.pages[0].elements[2].visibleIf).toBeUndefined();
  });

  it('maps rating skip logic into visibleIf using >= threshold', () => {
    const questions: PublicQuestion[] = [
      {
        id: 'r1',
        type: 'rating',
        title: 'Rate',
        sortOrder: 0,
        isRequired: false,
        options: [],
        config: {
          skipLogic: [{ selectedRating: 4, skipToQuestionIndex: 2 }],
        },
      },
      { ...baseQuestion, id: 'q2', title: 'Q2' },
      { ...baseQuestion, id: 'q3', title: 'Q3' },
    ];
    const model = quanswenToSurveyJs({ questions });
    expect(model.pages[0].elements[1].visibleIf).toBe('!({r1} >= 4)');
  });

  it('adds SurveyJS complete trigger for skip-to-end rules', () => {
    const questions: PublicQuestion[] = [
      {
        ...baseQuestion,
        id: 'q1',
        config: {
          skipLogic: [{ selectedOptionId: 'opt-b', skipToEnd: true }],
        },
      },
      { ...baseQuestion, id: 'q2', title: 'Q2' },
    ];
    const model = quanswenToSurveyJs({ questions });
    expect(model.triggers).toEqual([{ type: 'complete', expression: "{q1} = 'opt-b'" }]);
  });
});

describe('buildVisibleIfExpression', () => {
  it('returns SurveyJS expression for selectedOptionId', () => {
    expect(buildVisibleIfExpression('q1', { selectedOptionId: 'opt-a' })).toBe("{q1} = 'opt-a'");
  });

  it('returns SurveyJS expression for selectedRating threshold', () => {
    expect(buildVisibleIfExpression('q1', { selectedRating: 3 })).toBe('{q1} >= 3');
  });

  it('returns null when no condition fields are present', () => {
    expect(buildVisibleIfExpression('q1', { skipToEnd: true })).toBeNull();
  });
});

describe('extractAnswers', () => {
  const questions: PublicQuestion[] = [
    { ...baseQuestion, id: 'q1', type: 'single_choice' },
    {
      id: 'q2',
      type: 'multiple_choice',
      title: 'Multi',
      sortOrder: 1,
      isRequired: false,
      options: [
        { id: 'm1', label: 'M1', sortOrder: 0 },
        { id: 'm2', label: 'M2', sortOrder: 1 },
      ],
    },
    { id: 'q3', type: 'text', title: 'Text', sortOrder: 2, isRequired: false, options: [] },
    { id: 'q4', type: 'rating', title: 'Rate', sortOrder: 3, isRequired: false, options: [] },
  ];

  it('extracts single_choice answer', () => {
    const data = { q1: 'opt-a' };
    const answers = extractAnswers(data, questions);
    expect(answers[0]).toEqual({ questionId: 'q1', selectedOptionIds: ['opt-a'] });
  });

  it('extracts yes_no boolean answer', () => {
    const qs: PublicQuestion[] = [
      { ...baseQuestion, id: 'q1', type: 'single_choice', config: { variant: 'yes_no' } },
    ];
    const data = { q1: true };
    const answers = extractAnswers(data, qs);
    expect(answers[0].selectedOptionIds).toEqual(['yes']);
  });

  it('extracts yes_no false answer', () => {
    const qs: PublicQuestion[] = [
      { ...baseQuestion, id: 'q1', type: 'single_choice', config: { variant: 'yes_no' } },
    ];
    const data = { q1: false };
    const answers = extractAnswers(data, qs);
    expect(answers[0].selectedOptionIds).toEqual(['no']);
  });

  it('extracts multiple_choice answers', () => {
    const data = { q2: ['m1', 'm2'] };
    const answers = extractAnswers(data, questions);
    expect(answers[1]).toEqual({ questionId: 'q2', selectedOptionIds: ['m1', 'm2'] });
  });

  it('extracts text answer', () => {
    const data = { q3: 'Hello world' };
    const answers = extractAnswers(data, questions);
    expect(answers[2]).toEqual({ questionId: 'q3', textAnswer: 'Hello world' });
  });

  it('extracts rating answer', () => {
    const data = { q4: 4 };
    const answers = extractAnswers(data, questions);
    expect(answers[3]).toEqual({ questionId: 'q4', ratingValue: 4 });
  });

  it('handles missing data gracefully', () => {
    const data = {};
    const answers = extractAnswers(data, questions);
    expect(answers).toHaveLength(4);
    expect(answers[0]).toEqual({ questionId: 'q1' });
    expect(answers[1]).toEqual({ questionId: 'q2' });
    expect(answers[2]).toEqual({ questionId: 'q3' });
    expect(answers[3]).toEqual({ questionId: 'q4' });
  });

  it('extracts matrix answer as JSON string', () => {
    const qs: PublicQuestion[] = [
      {
        id: 'q5',
        type: 'matrix',
        title: 'Matrix',
        sortOrder: 0,
        isRequired: false,
        options: [],
      },
    ];
    // SurveyJS now uses the actual row/column label strings as keys (not 'row0'/'col0')
    const data = { q5: { 'Row 1': 'Col A', 'Row 2': 'Col B' } };
    const answers = extractAnswers(data, qs);
    expect(answers[0].textAnswer).toBe('{"Row 1":"Col A","Row 2":"Col B"}');
  });

  it('extracts numeric text answer as string', () => {
    const qs: PublicQuestion[] = [
      {
        id: 'q6',
        type: 'text',
        title: 'Age',
        sortOrder: 0,
        isRequired: false,
        config: { inputType: 'numeric' },
        options: [],
      },
    ];
    const data = { q6: 42 };
    const answers = extractAnswers(data, qs);
    expect(answers[0].textAnswer).toBe('42');
  });
});

describe('「其他（請填寫）」選項 → SurveyJS other item', () => {
  const otherQ: PublicQuestion = {
    ...baseQuestion,
    id: 'qo',
    options: [
      { id: 'opt-a', label: 'Option A', sortOrder: 0 },
      { id: 'opt-other', label: '其他（請填寫）', sortOrder: 1 },
    ],
  };

  it('轉換時啟用 showOtherItem，「其他」不重複出現在 choices', () => {
    const model = quanswenToSurveyJs({ questions: [otherQ] });
    const el = model.pages[0].elements[0];
    expect(el.showOtherItem).toBe(true);
    expect(el.otherText).toBe('其他（請填寫）');
    expect(el.choices).toEqual([{ value: 'opt-a', text: 'Option A' }]);
  });

  it('單選選了其他：回填原選項 id + 輸入文字進 textAnswer', () => {
    const answers = extractAnswers({ qo: 'other', 'qo-Comment': '自由工作者' }, [otherQ]);
    expect(answers[0].selectedOptionIds).toEqual(['opt-other']);
    expect(answers[0].textAnswer).toBe('自由工作者');
  });

  it('複選含其他：other 替換為原選項 id 並保留其他選項', () => {
    const multiQ: PublicQuestion = { ...otherQ, id: 'qm', type: 'multiple_choice' };
    const answers = extractAnswers(
      { qm: ['opt-a', 'other'], 'qm-Comment': '手工皂' },
      [multiQ],
    );
    expect(answers[0].selectedOptionIds).toEqual(['opt-a', 'opt-other']);
    expect(answers[0].textAnswer).toBe('手工皂');
  });

  it('沒有「其他」選項的題目不受影響', () => {
    const model = quanswenToSurveyJs({ questions: [baseQuestion] });
    expect(model.pages[0].elements[0].showOtherItem).toBeUndefined();
  });
});

describe('buildVideoEmbedUrl 白名單', () => {
  it('YouTube watch / youtu.be / shorts → nocookie embed + 靜音自動播放', () => {
    expect(buildVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&playsinline=1&rel=0');
    expect(buildVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ');
    expect(buildVideoEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ');
  });

  it('Vimeo → player embed', () => {
    expect(buildVideoEmbedUrl('https://vimeo.com/123456789'))
      .toBe('https://player.vimeo.com/video/123456789?autoplay=1&muted=1');
  });

  it('白名單外 / 非 https / 垃圾輸入 → null（防 iframe 注入）', () => {
    expect(buildVideoEmbedUrl('https://evil.com/embed/x')).toBeNull();
    expect(buildVideoEmbedUrl('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(buildVideoEmbedUrl('javascript:alert(1)')).toBeNull();
    expect(buildVideoEmbedUrl('https://youtube.com/watch?v=<script>')).toBeNull();
    expect(buildVideoEmbedUrl('')).toBeNull();
    expect(buildVideoEmbedUrl(undefined)).toBeNull();
  });
});

describe('題目影片元素插入', () => {
  it('config.videoUrl → 題目前插入 html 影片元素', () => {
    const videoQ: PublicQuestion = {
      ...baseQuestion,
      id: 'qv',
      config: { videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
    };
    const model = quanswenToSurveyJs({ questions: [videoQ] });
    const els = model.pages[0].elements;
    expect(els).toHaveLength(2);
    expect(els[0].type).toBe('html');
    expect(els[0].html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(els[1].name).toBe('qv');
  });

  it('無 videoUrl 的題目不插入額外元素', () => {
    const model = quanswenToSurveyJs({ questions: [baseQuestion] });
    expect(model.pages[0].elements).toHaveLength(1);
  });
});

describe('題目分區段 → SurveyJS 多頁', () => {
  const q = (id: string, sectionBreak?: Record<string, unknown>): PublicQuestion => ({
    ...baseQuestion,
    id,
    ...(sectionBreak ? { config: { sectionBreak } } : {}),
  });

  it('無區段 → 單頁、無橫幅', () => {
    const model = quanswenToSurveyJs({ questions: [q('q1'), q('q2')] });
    expect(model.pages).toHaveLength(1);
    expect(model.pages[0].elements).toHaveLength(2);
  });

  it('Q1+Q2 第一區段、Q3 第二區段 → 兩頁，各頁開頭有彩色橫幅', () => {
    const model = quanswenToSurveyJs({
      questions: [
        q('q1', { name: '基本資料', color: '#10b981' }),
        q('q2'),
        q('q3', { name: '消費習慣', description: '關於你的日常消費', color: '#8B5CF6' }),
      ],
    });
    expect(model.pages).toHaveLength(2);
    // 第一頁：橫幅 + q1 + q2
    expect(model.pages[0].elements.map((e) => e.name)).toEqual(['q1-section', 'q1', 'q2']);
    expect(model.pages[0].elements[0].type).toBe('html');
    expect(model.pages[0].elements[0].html).toContain('基本資料');
    expect(model.pages[0].elements[0].html).toContain('#10b981');
    // 第二頁：橫幅（含說明）+ q3
    expect(model.pages[1].elements.map((e) => e.name)).toEqual(['q3-section', 'q3']);
    expect(model.pages[1].elements[0].html).toContain('關於你的日常消費');
  });

  it('區段前的散題自成第一頁（無橫幅）', () => {
    const model = quanswenToSurveyJs({
      questions: [q('q1'), q('q2', { name: '第二部分' })],
    });
    expect(model.pages).toHaveLength(2);
    expect(model.pages[0].elements.map((e) => e.name)).toEqual(['q1']);
    expect(model.pages[1].elements.map((e) => e.name)).toEqual(['q2-section', 'q2']);
  });

  it('安全：區段名稱 HTML escape、顏色走白名單', () => {
    const model = quanswenToSurveyJs({
      questions: [q('q1', { name: '<script>alert(1)</script>', color: 'red; background:url(x)' })],
    });
    const banner = model.pages[0].elements[0];
    expect(banner.html).not.toContain('<script>');
    expect(banner.html).toContain('&lt;script&gt;');
    expect(banner.html).not.toContain('url(x)');  // 非白名單色 → fallback 預設色
  });
});
