import { describe, it, expect, beforeEach } from 'vitest';
import { WithdrawalRiskService, type WithdrawalRisk } from './withdrawal-risk.service';

/**
 * 只測 fallback rule-based 評分（純函式）。
 * LLM 路徑 + DB 查詢屬整合測試範疇。
 */
describe('WithdrawalRiskService.fallback', () => {
  let svc: WithdrawalRiskService;

  beforeEach(() => {
    // 使用任意 stub；fallback 不會用到 db/zai
    svc = new WithdrawalRiskService({} as never, {} as never);
  });

  function fb(input: Parameters<WithdrawalRiskService['fallback']>[0]): WithdrawalRisk {
    return (svc as unknown as { fallback: (i: typeof input) => WithdrawalRisk }).fallback(input);
  }

  it('完全乾淨 → low / approve', () => {
    const r = fb({
      amount: 100,
      totalEarnings: 1000,
      accountAgeDays: 60,
      emailVerified: true,
      suspiciousCount: 0,
    });
    expect(r.riskLevel).toBe('low');
    expect(r.recommendation).toBe('approve');
    expect(r.redFlags).toHaveLength(0);
  });

  it('提領 > 累計獎勵 → high / reject', () => {
    const r = fb({
      amount: 5000,
      totalEarnings: 100,
      accountAgeDays: 60,
      emailVerified: true,
      suspiciousCount: 0,
    });
    expect(r.riskLevel).toBe('high');
    expect(r.recommendation).toBe('reject');
    expect(r.redFlags.some((f) => f.includes('超過累計獎勵'))).toBe(true);
  });

  it('新帳號 + 大額 → 觸發新帳號 flag', () => {
    const r = fb({
      amount: 1000,
      totalEarnings: 2000,
      accountAgeDays: 1,
      emailVerified: true,
      suspiciousCount: 0,
    });
    expect(r.redFlags.some((f) => f.includes('帳號僅'))).toBe(true);
    expect(r.riskLevel).not.toBe('low');
  });

  it('新帳號但金額 < 500 → 不觸發新帳號 flag', () => {
    const r = fb({
      amount: 200,
      totalEarnings: 500,
      accountAgeDays: 1,
      emailVerified: true,
      suspiciousCount: 0,
    });
    expect(r.redFlags.some((f) => f.includes('帳號僅'))).toBe(false);
  });

  it('Email 未驗證 → +20 (medium)', () => {
    const r = fb({
      amount: 100,
      totalEarnings: 500,
      accountAgeDays: 60,
      emailVerified: false,
      suspiciousCount: 0,
    });
    expect(r.redFlags.some((f) => f.includes('Email'))).toBe(true);
    expect(r.riskLevel).toBe('medium');
    expect(r.recommendation).toBe('manual_review');
  });

  it('可疑填答 ≥ 3 → 觸發', () => {
    const r = fb({
      amount: 100,
      totalEarnings: 500,
      accountAgeDays: 60,
      emailVerified: true,
      suspiciousCount: 5,
    });
    expect(r.redFlags.some((f) => f.includes('可疑填答'))).toBe(true);
    // 單獨觸發 30 分 → medium
    expect(r.riskLevel).toBe('medium');
  });

  it('可疑填答 = 2 → 不觸發', () => {
    const r = fb({
      amount: 100,
      totalEarnings: 500,
      accountAgeDays: 60,
      emailVerified: true,
      suspiciousCount: 2,
    });
    expect(r.redFlags.some((f) => f.includes('可疑填答'))).toBe(false);
  });

  it('多重風險疊加 → high / reject', () => {
    const r = fb({
      amount: 9999,
      totalEarnings: 50,
      accountAgeDays: 1,
      emailVerified: false,
      suspiciousCount: 4,
    });
    expect(r.riskLevel).toBe('high');
    expect(r.recommendation).toBe('reject');
    expect(r.redFlags.length).toBeGreaterThanOrEqual(4);
  });

  it('reasoning 反映 risk level', () => {
    const low = fb({
      amount: 50,
      totalEarnings: 1000,
      accountAgeDays: 60,
      emailVerified: true,
      suspiciousCount: 0,
    });
    expect(low.reasoning).toContain('無明顯風險');

    const high = fb({
      amount: 9999,
      totalEarnings: 100,
      accountAgeDays: 60,
      emailVerified: true,
      suspiciousCount: 0,
    });
    expect(high.reasoning).toContain('風險訊號');
  });
});
