import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiInsightsService } from './ai-insights.service';
import type { ZaiClient } from '../ai-audit/zai.client';
import { clearInsightsCache } from './analysis/insights-cache';

const stats = {
  title: 'survey',
  totalResponses: 12,
  questionStats: [
    {
      questionId: 'q1',
      title: 'open text',
      type: 'text',
      totalAnswers: 3,
      sampleTexts: ['Great checkout speed', 'Need more healthy options'],
    },
  ],
};

function makeService(chatImpl: (...a: unknown[]) => Promise<string>) {
  const zai = { chat: vi.fn(chatImpl) } as unknown as ZaiClient;
  return new AiInsightsService(zai);
}

describe('AiInsightsService quote evidence', () => {
  beforeEach(() => {
    clearInsightsCache();
  });

  it('adds quote evidence to findings when model output has no quote', async () => {
    const svc = makeService(async () =>
      JSON.stringify({
        summary: 'summary',
        keyFindings: ['Most users like checkout speed'],
        concerns: [],
        recommendations: [],
      }),
    );

    const r = await svc.analyze(stats, 'simple');
    expect(r.keyFindings).toHaveLength(1);
    expect(r.keyFindings[0]).toContain('Most users like checkout speed');
    expect(r.keyFindings[0]).toContain('(quote: "');
  });
});
