import { describe, expect, it } from 'vitest';
import { resolveQualityVerdict } from './quality-audit.service';

describe('resolveQualityVerdict 三段裁決 + 動態容錯救回', () => {
  it('基本三段：>=80 passed、50-79 suspicious、<50 rejected', () => {
    expect(resolveQualityVerdict(85, null, { textQuality: 50 }).status).toBe('passed');
    expect(resolveQualityVerdict(65, null, { textQuality: 50 }).status).toBe('suspicious');
    expect(resolveQualityVerdict(30, null, { textQuality: 50 }).status).toBe('rejected');
  });

  it('LLM 建議往嚴格方向覆寫', () => {
    expect(resolveQualityVerdict(85, 'manual_review', { textQuality: 50 }).status).toBe('suspicious');
    expect(resolveQualityVerdict(85, 'reject', { textQuality: 90 }).status).toBe('rejected');
  });

  it('救回：40-49 邊緣分 + 文字品質 >=70 → suspicious 並附說明 flag', () => {
    const verdict = resolveQualityVerdict(45, null, { textQuality: 75 });
    expect(verdict.status).toBe('suspicious');
    expect(verdict.rescueFlag).toContain('轉人工複核');
  });

  it('不救回：分數 <40（太低）', () => {
    const verdict = resolveQualityVerdict(39, null, { textQuality: 90 });
    expect(verdict.status).toBe('rejected');
    expect(verdict.rescueFlag).toBeNull();
  });

  it('不救回：文字品質 <70（開放題無實質內容）', () => {
    const verdict = resolveQualityVerdict(45, null, { textQuality: 60 });
    expect(verdict.status).toBe('rejected');
    expect(verdict.rescueFlag).toBeNull();
  });

  it('不救回：LLM 明確建議拒絕', () => {
    const verdict = resolveQualityVerdict(45, 'reject', { textQuality: 90 });
    expect(verdict.status).toBe('rejected');
    expect(verdict.rescueFlag).toBeNull();
  });
});
