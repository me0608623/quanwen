import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformHealthService } from './platform-health.service';
import type { PlatformHealthSummary } from './platform-health.service';

/**
 * 只測 fallback rule-based path（LLM 路徑屬整合測試）。
 */
describe('PlatformHealthService.fallback', () => {
  let svc: PlatformHealthService;

  beforeEach(() => {
    svc = new PlatformHealthService({} as never);
  });

  type FallbackInput = Parameters<PlatformHealthService['fallback']>[0];

  function fb(overrides: Partial<FallbackInput> = {}): PlatformHealthSummary {
    const stats: FallbackInput = {
      totalUsers: 100,
      totalSurveyors: 10,
      totalRespondents: 90,
      surveyCounts: { pending_review: 0, published: 5, draft: 0, closed: 0, rejected: 0, paused: 0 },
      totalResponses: 50,
      suspiciousResponses: 0,
      platformRevenue: 1000,
      platformRevenueThisMonth: 100,
      ...overrides,
    };
    return (
      svc as unknown as { fallback: (i: FallbackInput) => PlatformHealthSummary }
    ).fallback(stats);
  }

  it('健康狀態：可疑比率低 + pending 少 → healthy', () => {
    const r = fb();
    expect(r.status).toBe('healthy');
    expect(r.headline).toContain('健康');
  });

  it('attention 狀態：pending ≥ 5 → attention', () => {
    const r = fb({ surveyCounts: { pending_review: 5, published: 5 } });
    expect(r.status).toBe('attention');
    expect(r.concerns.some((c) => c.includes('待審'))).toBe(true);
  });

  it('critical 狀態：可疑比率 > 20% → critical', () => {
    const r = fb({ totalResponses: 100, suspiciousResponses: 25 });
    expect(r.status).toBe('critical');
    expect(r.headline).toContain('可疑');
  });

  it('highlights 包含 user count / monthly revenue / responses', () => {
    const r = fb();
    expect(r.highlights.some((h) => h.includes('100'))).toBe(true);
    expect(r.highlights.some((h) => h.includes('100'))).toBe(true);
    expect(r.highlights.some((h) => h.includes('50'))).toBe(true);
  });

  it('concerns 空陣列當無 pending / 無可疑', () => {
    const r = fb();
    expect(r.concerns).toEqual([]);
  });

  it('suggestedActions 過濾空字串', () => {
    const r = fb({
      surveyCounts: { pending_review: 3 },
      suspiciousResponses: 5,
      totalResponses: 100,
    });
    // 應該有兩條（pending + suspicious），不含空字串
    expect(r.suggestedActions.every((a) => a.length > 0)).toBe(true);
    expect(r.suggestedActions.length).toBeGreaterThanOrEqual(2);
  });

  it('受試者供需失衡建議：respondents < surveyors × 5', () => {
    const r = fb({ totalSurveyors: 100, totalRespondents: 50 });
    expect(r.suggestedActions.some((a) => a.includes('招募'))).toBe(true);
  });

  it('generatedAt 是 ISO 字串', () => {
    const r = fb();
    expect(typeof r.generatedAt).toBe('string');
    expect(() => new Date(r.generatedAt).toISOString()).not.toThrow();
  });

  it('totalResponses=0 時不會除零錯誤', () => {
    const r = fb({ totalResponses: 0, suspiciousResponses: 0 });
    expect(r.status).toBe('healthy');
    expect(r.highlights.some((h) => h.includes('累計填答'))).toBe(false);
  });
});
