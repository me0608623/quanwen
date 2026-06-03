import { describe, expect, it } from 'vitest';
import { SURVEY_TEMPLATES } from './survey-templates';

describe('SURVEY_TEMPLATES', () => {
  it('每個範本有題目、標題、key', () => {
    expect(SURVEY_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of SURVEY_TEMPLATES) {
      expect(t.key).toBeTruthy();
      expect(t.title).toBeTruthy();
      const qs = t.build();
      expect(qs.length).toBeGreaterThan(0);
      qs.forEach((q, i) => {
        expect(q.title).toBeTruthy();
        expect(q.sortOrder).toBe(i);
        if (q.type === 'single_choice') expect((q.options?.length ?? 0)).toBeGreaterThanOrEqual(2);
      });
    }
  });
  it('build() 每次產生新的 option id', () => {
    const a = SURVEY_TEMPLATES[0].build();
    const b = SURVEY_TEMPLATES[0].build();
    const aid = a.find((q) => q.options)?.options?.[0]?.id;
    const bid = b.find((q) => q.options)?.options?.[0]?.id;
    expect(aid).toBeTruthy();
    expect(aid).not.toBe(bid);
  });
});
