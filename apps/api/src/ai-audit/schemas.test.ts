/**
 * Phase II.2: AI LLM 輸出 Zod 防呆驗證
 */
import { describe, it, expect } from 'vitest';
import {
  parseHolisticJudge,
  parseWithdrawalRisk,
  parsePlatformHealth,
  GROUNDING_SUFFIX,
} from './schemas';

describe('parseHolisticJudge', () => {
  it('合法輸入完整通過', () => {
    const r = parseHolisticJudge({
      sincerity_score: 75,
      primary_concern: '某些題答得太快',
      evidence: ['Q3 答題僅 1.2 秒', 'Q5 文字回答僅 3 字'],
      recommendation: 'manual_review',
      summary: '建議人工複核',
    });
    expect(r.sincerity_score).toBe(75);
    expect(r.recommendation).toBe('manual_review');
    expect(r.evidence).toHaveLength(2);
  });

  it('score 超出 0-100 範圍 → 0 fallback（保守拒絕）', () => {
    expect(parseHolisticJudge({ sincerity_score: 150 }).sincerity_score).toBe(0);
    expect(parseHolisticJudge({ sincerity_score: -20 }).sincerity_score).toBe(0);
  });

  it('score 是字串 → 嘗試轉 number', () => {
    expect(parseHolisticJudge({ sincerity_score: '85' }).sincerity_score).toBe(85);
  });

  it('score 是無法解析的字串 → 0', () => {
    expect(parseHolisticJudge({ sincerity_score: 'abc' }).sincerity_score).toBe(0);
  });

  it('recommendation 不在 enum → 退回 manual_review', () => {
    const r = parseHolisticJudge({
      sincerity_score: 60,
      recommendation: '需要人工審查',
    });
    expect(r.recommendation).toBe('manual_review');
  });

  it('evidence 不是 array → 空 array', () => {
    const r = parseHolisticJudge({
      sincerity_score: 60,
      evidence: '這是字串而非陣列',
    });
    expect(r.evidence).toEqual([]);
  });

  it('evidence 超過 10 條 → fallback 為空 array（lenient）', () => {
    const r = parseHolisticJudge({
      sincerity_score: 60,
      evidence: Array.from({ length: 15 }, (_, i) => `e${i}`),
    });
    expect(r.evidence).toEqual([]);
  });

  it('primary_concern 超過 500 字 → fallback 為 undefined', () => {
    const r = parseHolisticJudge({
      sincerity_score: 60,
      primary_concern: 'x'.repeat(501),
    });
    expect(r.primary_concern).toBeUndefined();
  });

  it('多餘欄位被忽略（passthrough 留著但不影響 type）', () => {
    const r = parseHolisticJudge({
      sincerity_score: 70,
      mysterious_extra: 'should be ignored',
    });
    expect(r.sincerity_score).toBe(70);
  });

  it('全空物件 → score=0、recommendation undefined、evidence=[]', () => {
    const r = parseHolisticJudge({});
    expect(r.sincerity_score).toBe(0);
    expect(r.recommendation).toBeUndefined();
    expect(r.evidence).toEqual([]);
  });
});

describe('parseWithdrawalRisk', () => {
  it('合法輸入', () => {
    const r = parseWithdrawalRisk({
      riskLevel: 'high',
      redFlags: ['帳號 < 3 天', '提領 > 累計獎勵'],
      recommendation: 'reject',
      reasoning: '高風險疑似詐欺',
    });
    expect(r.riskLevel).toBe('high');
    expect(r.recommendation).toBe('reject');
  });

  it('riskLevel 怪字串 → medium（保守 fallback）', () => {
    expect(
      parseWithdrawalRisk({
        riskLevel: '極高風險',
        redFlags: [],
        recommendation: 'reject',
        reasoning: 'x',
      }).riskLevel,
    ).toBe('medium');
  });

  it('reasoning 缺失 → fallback 文案', () => {
    const r = parseWithdrawalRisk({
      riskLevel: 'low',
      redFlags: [],
      recommendation: 'approve',
      reasoning: 12345, // 非字串
    });
    expect(r.reasoning).toContain('格式異常');
  });
});

describe('parsePlatformHealth', () => {
  it('合法輸入', () => {
    const r = parsePlatformHealth({
      status: 'healthy',
      headline: '平台運作正常',
      highlights: ['累積 100 用戶'],
      concerns: [],
      suggestedActions: [],
    });
    expect(r.status).toBe('healthy');
  });

  it('status 怪值 → attention', () => {
    const r = parsePlatformHealth({
      status: 'AMAZING',
      headline: 'x',
      highlights: [],
      concerns: [],
      suggestedActions: [],
    });
    expect(r.status).toBe('attention');
  });

  it('arrays 缺失 → 空 array', () => {
    const r = parsePlatformHealth({ status: 'healthy', headline: 'x' });
    expect(r.highlights).toEqual([]);
    expect(r.concerns).toEqual([]);
    expect(r.suggestedActions).toEqual([]);
  });
});

describe('GROUNDING_SUFFIX', () => {
  it('包含關鍵 anti-hallucination 條款', () => {
    expect(GROUNDING_SUFFIX).toContain('input');
    expect(GROUNDING_SUFFIX).toContain('manual_review');
    expect(GROUNDING_SUFFIX).toContain('禁止猜測');
    expect(GROUNDING_SUFFIX).toContain('0-100');
  });
});
