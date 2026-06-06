/**
 * SurveyCake 原生 s3/json 格式解析器測試。
 * 回歸:surveycake.com/s/{svid} 是 SPA,HTML 無嵌入 JSON,
 * 題目實際在 https://www.surveycake.com/s3/json/{svid}.json(原生 subjects 格式)。
 */
import { describe, it, expect } from 'vitest';
import { parseSurveyCakeNative } from './surveycake-native-parser';

const opt = (text: string, orders: number) => ({ text, orders, invisible: 0 });

const FIXTURE = {
  title: '測試問卷',
  welcometext: '<p>歡迎填寫</p>',
  subjects: [
    {
      type: 'CHOICEONE', text: '請問您是否使用過自然人憑證?', orders: 0,
      required: 1, invisible: 0,
      options: [opt('是', 0), opt('否', 1)],
    },
    {
      type: 'CHOICEMULTI', text: '您使用過哪些服務?', orders: 1,
      required: 0, invisible: 0,
      options: [opt('報稅', 0), opt('勞保', 1), opt('健保', 2)],
    },
    { type: 'TXTSHORT', text: '您的職業是?', orders: 2, required: 1, invisible: 0, options: null },
    {
      type: 'NEST', text: '感知易用性', orders: 3, required: 1, invisible: 0,
      options: [opt('非常不同意', 0), opt('不同意', 1), opt('同意', 2), opt('非常同意', 3)],
    },
    { type: 'NESTCHILD', text: '操作方式容易理解', orders: 4, required: 0, invisible: 0, options: null },
    { type: 'NESTCHILD', text: '使用流程簡單', orders: 5, required: 0, invisible: 0, options: null },
    { type: 'STATEMENT', text: '以下是第二部分', orders: 6, required: 0, invisible: 0, options: null },
    { type: 'TXTSHORT', text: '其他意見', orders: 7, required: 0, invisible: 0, options: null },
    { type: 'TXTSHORT', text: '隱藏題', orders: 8, required: 0, invisible: 1, options: null },
  ],
};

describe('parseSurveyCakeNative', () => {
  it('解析標題與描述(HTML 已剝除)', () => {
    const r = parseSurveyCakeNative(FIXTURE);
    expect(r.title).toBe('測試問卷');
    expect(r.description).toBe('歡迎填寫');
  });

  it('CHOICEONE → single_choice 含選項', () => {
    const r = parseSurveyCakeNative(FIXTURE);
    const q = r.questions.find((x) => x.title === '請問您是否使用過自然人憑證?');
    expect(q?.type).toBe('single_choice');
    expect(q?.isRequired).toBe(true);
    expect(q?.options?.map((o) => o.label)).toEqual(['是', '否']);
  });

  it('CHOICEMULTI → multiple_choice', () => {
    const r = parseSurveyCakeNative(FIXTURE);
    const q = r.questions.find((x) => x.title === '您使用過哪些服務?');
    expect(q?.type).toBe('multiple_choice');
    expect(q?.options?.length).toBe(3);
  });

  it('TXTSHORT → text', () => {
    const r = parseSurveyCakeNative(FIXTURE);
    const q = r.questions.find((x) => x.title === '您的職業是?');
    expect(q?.type).toBe('text');
  });

  it('NEST + NESTCHILD → matrix(rows=子題, columns=量表)', () => {
    const r = parseSurveyCakeNative(FIXTURE);
    const q = r.questions.find((x) => x.title === '感知易用性');
    expect(q?.type).toBe('matrix');
    const matrix = (q?.config as { matrix?: { rows?: string[]; columns?: string[] } })?.matrix;
    expect(matrix?.rows).toEqual(['操作方式容易理解', '使用流程簡單']);
    expect(matrix?.columns).toEqual(['非常不同意', '不同意', '同意', '非常同意']);
  });

  it('STATEMENT 與 invisible 題目跳過,不產生題目', () => {
    const r = parseSurveyCakeNative(FIXTURE);
    const titles = r.questions.map((q) => q.title);
    expect(titles).not.toContain('以下是第二部分');
    expect(titles).not.toContain('隱藏題');
  });

  it('未知題型 fallback 為 text 並收 warning', () => {
    const r = parseSurveyCakeNative({
      title: 'x',
      subjects: [{ type: 'WEIRD', text: '怪題', orders: 0, required: 0, invisible: 0, options: null }],
    });
    expect(r.questions[0]?.type).toBe('text');
    expect(r.warnings.some((w) => w.includes('WEIRD'))).toBe(true);
  });

  it('空 subjects 回傳零題', () => {
    const r = parseSurveyCakeNative({ title: 'x', subjects: [] });
    expect(r.questions).toEqual([]);
  });
});
