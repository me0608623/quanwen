import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiInsightsService } from './ai-insights.service';
import type { ZaiClient } from '../ai-audit/zai.client';
import { clearInsightsCache } from './analysis/insights-cache';

// 最小 stats 輸入（3 份以上才會打 LLM）
const stats = {
  title: '測試問卷',
  totalResponses: 12,
  questionStats: [
    {
      questionId: 'q1',
      title: '你最常用哪個通路?',
      type: 'single_choice',
      totalAnswers: 12,
      optionCounts: [
        { label: '7-11', count: 8 },
        { label: '全家', count: 4 },
      ],
    },
    {
      questionId: 'q2',
      title: '整體滿意度',
      type: 'rating',
      totalAnswers: 12,
      averageRating: 4.2,
    },
  ],
  qualityDistribution: {
    total: 12, passed: 10, suspicious: 1, rejected: 1, unaudited: 0, avgScore: 84,
  },
};

function makeService(chatImpl: (...a: unknown[]) => Promise<string>) {
  const zai = { chat: vi.fn(chatImpl) } as unknown as ZaiClient;
  return { svc: new AiInsightsService(zai), zai };
}

describe('AiInsightsService — 簡單/詳細報告分級', () => {
  beforeEach(() => {
    clearInsightsCache();
  });

  it('simple：LLM 成功 → reportType=simple，無 detailed 區塊', async () => {
    const { svc } = makeService(async () =>
      JSON.stringify({
        summary: '整體滿意度高',
        keyFindings: ['7-11 最受歡迎 (67%)'],
        concerns: ['樣本偏少'],
        recommendations: ['擴大樣本'],
      }),
    );
    const r = await svc.analyze(stats, 'simple');
    expect(r.reportType).toBe('simple');
    expect(r.summary).toContain('滿意度');
    expect(r.questionBreakdown).toBeUndefined();
    expect(r.crossFindings).toBeUndefined();
    expect(r.methodology).toBeUndefined();
  });

  it('detailed：LLM 成功 → reportType=detailed，含逐題/交叉/方法', async () => {
    const { svc } = makeService(async () =>
      JSON.stringify({
        summary: '詳細摘要',
        keyFindings: ['發現一', '發現二'],
        questionBreakdown: [
          { question: '你最常用哪個通路?', insight: '7-11 領先' },
          { question: '整體滿意度', insight: '平均 4.2 偏高' },
        ],
        crossFindings: ['高滿意者多用 7-11'],
        concerns: ['樣本 12 份偏少'],
        recommendations: ['追加題目驗證'],
        methodology: '樣本 12 份，品質分 84，結論信賴度中等。',
      }),
    );
    const r = await svc.analyze(stats, 'detailed');
    expect(r.reportType).toBe('detailed');
    expect(r.questionBreakdown).toHaveLength(2);
    expect(r.questionBreakdown?.[0]).toHaveProperty('insight');
    expect(r.crossFindings?.length).toBeGreaterThan(0);
    expect(r.methodology).toContain('信賴度');
  });

  it('預設參數 = simple', async () => {
    const { svc } = makeService(async () => JSON.stringify({ summary: 's', keyFindings: [], concerns: [], recommendations: [] }));
    const r = await svc.analyze(stats);
    expect(r.reportType).toBe('simple');
  });

  it('樣本 < 3 → fallback，保留 reportType；detailed 仍給逐題 + 方法', async () => {
    const { svc, zai } = makeService(async () => '{}');
    const r = await svc.analyze({ ...stats, totalResponses: 2 }, 'detailed');
    expect(zai.chat).not.toHaveBeenCalled(); // 樣本太少不打 LLM
    expect(r.reportType).toBe('detailed');
    expect(Array.isArray(r.questionBreakdown)).toBe(true);
    expect(r.methodology).toBeTruthy();
  });

  it('LLM 失敗 → fallback，保留 reportType', async () => {
    const { svc } = makeService(async () => {
      throw new Error('ZAI down');
    });
    const r = await svc.analyze(stats, 'detailed');
    expect(r.reportType).toBe('detailed');
    expect(r.summary).toContain('AI 服務暫時不可用');
    expect(Array.isArray(r.questionBreakdown)).toBe(true);
  });
});
