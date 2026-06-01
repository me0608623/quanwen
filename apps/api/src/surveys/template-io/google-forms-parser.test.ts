/**
 * Phase 2 — google-forms-parser 純函數單元測試
 *
 * 覆蓋:
 *  1. extractFbPublicLoadData: 標準 var FB_PUBLIC_LOAD_DATA_ = [...]; 抽得出
 *  2. extractFbPublicLoadData: 巢狀陣列 + 字串內含 `]` 不會誤判
 *  3. extractFbPublicLoadData: 不存在 → throw
 *  4. mapFormToV1: 各題型對映正確(text / single_choice / multiple_choice / rating / matrix)
 *  5. mapFormToV1: 不支援題型(date / file_upload)→ skipped 列出,questions 不含
 *  6. mapFormToV1: 全空 questions → body.questions 為 []
 *  7. mapFormToV1: dropdown(type 3)降級為 single_choice
 *  8. mapFormToV1: 選項少於 2 → 該題進 skipped
 */
import { describe, it, expect } from 'vitest';
import { extractFbPublicLoadData, mapFormToV1 } from './google-forms-parser';

// 建構 Google Forms item 的小幫手
const radio = (id: number, title: string, opts: string[], required = true) => [
  id,
  title,
  null,
  2,
  [[null, opts.map((o) => [o]), null, null, required ? 1 : 0]],
];
const checkbox = (id: number, title: string, opts: string[]) => [
  id, title, null, 4,
  [[null, opts.map((o) => [o]), null, null, 1]],
];
const dropdown = (id: number, title: string, opts: string[]) => [
  id, title, null, 3,
  [[null, opts.map((o) => [o]), null, null, 1]],
];
const shortAnswer = (id: number, title: string) => [
  id, title, null, 0, [[null, null, null, null, 1]],
];
const paragraph = (id: number, title: string) => [
  id, title, null, 1, [[null, null, null, null, 0]],
];
const linearScale = (id: number, title: string, max: number) => [
  id, title, null, 5,
  [[null, Array.from({ length: max }, (_, i) => [String(i + 1)]), null,
    [[`min`], [`max`]], 1]],
];
const grid = (id: number, title: string, rows: string[], cols: string[]) => [
  id, title, null, 7,
  rows.map((r) => [
    id + Math.random(), cols.map((c) => [c]), null, r, null, null, null, 0,
  ]),
];
const dateField = (id: number, title: string) => [id, title, null, 9, [[null, null, null, null, 1]]];
const fileUpload = (id: number, title: string) => [id, title, null, 13, [[null, null, null, null, 1]]];
const section = (id: number) => [id, '節', null, 6, []];

// 建構整份 FB_PUBLIC_LOAD_DATA_(只關心 block[1][1] = items 與 block[1][8] = title)
const formData = (title: string, items: unknown[]) => [
  null,
  [
    'desc',
    items,
    null,
    null,
    null,
    null,
    null,
    null,
    title,
  ],
];

describe('google-forms-parser', () => {
  describe('extractFbPublicLoadData', () => {
    it('1. 標準格式 var FB_PUBLIC_LOAD_DATA_ = [...]; 抽得出', () => {
      const fb = [1, [null, [], null, null, null, null, null, null, '標題']];
      const html = `<html><body><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(fb)};</script></body></html>`;
      const got = extractFbPublicLoadData(html);
      expect(Array.isArray(got)).toBe(true);
    });

    it('2. 巢狀陣列 + 字串內含 `]` 不會誤判收尾', () => {
      // 字串內含 `]` 不能讓 bracket counter 提前歸零
      const tricky = `var FB_PUBLIC_LOAD_DATA_ = [1, [null, [], "abc]def", "x"], 2];`;
      const got = extractFbPublicLoadData(tricky) as unknown[];
      expect(got).toHaveLength(3);
      expect(got[0]).toBe(1);
      expect(got[2]).toBe(2);
    });

    it('3. 不存在 → throw', () => {
      expect(() => extractFbPublicLoadData('<html>沒這東西</html>')).toThrow(/找不到 FB_PUBLIC_LOAD_DATA_/);
    });
  });

  describe('mapFormToV1', () => {
    it('4a. radio(type 2)→ single_choice', () => {
      const data = formData('問卷 A', [radio(1, 'Q1', ['A', 'B'])]);
      const { body, skipped } = mapFormToV1(data);
      expect(body.title).toBe('問卷 A');
      expect(body.questions).toHaveLength(1);
      expect(body.questions[0].type).toBe('single_choice');
      expect(body.questions[0].options).toHaveLength(2);
      expect(body.questions[0].options?.[0].label).toBe('A');
      expect(skipped).toHaveLength(0);
    });

    it('4b. checkbox(type 4)→ multiple_choice', () => {
      const data = formData('Q', [checkbox(1, 'C', ['X', 'Y', 'Z'])]);
      const { body } = mapFormToV1(data);
      expect(body.questions[0].type).toBe('multiple_choice');
      expect(body.questions[0].options).toHaveLength(3);
    });

    it('4c. short answer(type 0)→ text {multiline:false}', () => {
      const data = formData('Q', [shortAnswer(1, '請輸入名字')]);
      const { body } = mapFormToV1(data);
      expect(body.questions[0].type).toBe('text');
      expect(body.questions[0].config).toEqual({ multiline: false });
    });

    it('4d. paragraph(type 1)→ text {multiline:true}', () => {
      const data = formData('Q', [paragraph(1, '建議')]);
      const { body } = mapFormToV1(data);
      expect(body.questions[0].type).toBe('text');
      expect(body.questions[0].config).toEqual({ multiline: true });
    });

    it('4e. linear scale(type 5)→ rating {max:5}', () => {
      const data = formData('Q', [linearScale(1, '滿意度', 5)]);
      const { body } = mapFormToV1(data);
      expect(body.questions[0].type).toBe('rating');
      const cfg = body.questions[0].config as { max: number };
      expect(cfg.max).toBe(5);
    });

    it('4f. grid(type 7)→ matrix', () => {
      const data = formData('Q', [grid(1, '評分', ['品質', '價格'], ['差', '普通', '好'])]);
      const { body } = mapFormToV1(data);
      expect(body.questions[0].type).toBe('matrix');
      const cfg = body.questions[0].config as { rows: string[]; cols: string[]; cellType: string };
      expect(cfg.rows).toEqual(['品質', '價格']);
      expect(cfg.cols).toEqual(['差', '普通', '好']);
      expect(cfg.cellType).toBe('radio');
    });

    it('5. 不支援題型 date(9)/ file_upload(13)→ 列入 skipped', () => {
      const data = formData('Q', [
        radio(1, '可用題', ['A', 'B']),
        dateField(2, '生日'),
        fileUpload(3, '證件'),
      ]);
      const { body, skipped } = mapFormToV1(data);
      expect(body.questions).toHaveLength(1); // 只剩可用題
      expect(skipped).toHaveLength(2);
      expect(skipped.map((s) => s.type).sort()).toEqual(['date', 'file_upload']);
      expect(skipped[0].reason).toMatch(/不被券問平台支援/);
    });

    it('6. 全空 questions → body.questions = []', () => {
      const data = formData('空問卷', []);
      const { body } = mapFormToV1(data);
      expect(body.questions).toEqual([]);
    });

    it('7. dropdown(type 3)→ 降級為 single_choice', () => {
      const data = formData('Q', [dropdown(1, '選擇', ['甲', '乙', '丙'])]);
      const { body } = mapFormToV1(data);
      expect(body.questions[0].type).toBe('single_choice');
    });

    it('8. choice 選項少於 2 → 該題進 skipped', () => {
      const data = formData('Q', [radio(1, '空選項', [])]);
      const { body, skipped } = mapFormToV1(data);
      expect(body.questions).toHaveLength(0);
      expect(skipped).toHaveLength(1);
      expect(skipped[0].reason).toMatch(/選項少於 2/);
    });

    it('9. section(type 6)略過但不算 skipped(裝飾性)', () => {
      const data = formData('Q', [section(1), radio(2, 'Q', ['A', 'B'])]);
      const { body, skipped } = mapFormToV1(data);
      expect(body.questions).toHaveLength(1);
      expect(skipped).toHaveLength(0);
    });
  });
});
