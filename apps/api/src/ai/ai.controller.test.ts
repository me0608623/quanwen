import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { AiController } from './ai.controller';
import type { AnalyticsService } from '../analytics/analytics.service';
import type { AiUsageService } from '../common/ai-usage.service';
import type { ResponsesService } from '../responses/responses.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import type { AiInsightsService, SurveyInsights } from '../surveys/ai-insights.service';
import type { AiReportStoreService } from '../surveys/ai-report-store.service';
import type { SurveysService } from '../surveys/surveys.service';
import { AiPromptDedupeService } from '../common/ai-prompt-dedupe.service';

const SURVEY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';
const QA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const QB = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeController() {
  const analytics = {
    getCrossTab: vi.fn().mockResolvedValue({ matrix: [[2]], cramersV: 0.5 }),
    getScaleReliability: vi.fn().mockResolvedValue({ cronbachAlpha: 0.82 }),
    getNps: vi.fn().mockResolvedValue({ nps: 42 }),
    getCorrelation: vi.fn().mockResolvedValue({ pearsonR: 0.7 }),
    getGroupComparison: vi.fn().mockResolvedValue({ test: { type: 't', p: 0.04 } }),
    getRegression: vi.fn().mockResolvedValue({ rSquared: 0.61 }),
    getSegmentation: vi.fn().mockResolvedValue({ totalRespondents: 9, segments: [] }),
  };
  const aiInsights = {
    interpretStatistics: vi.fn().mockResolvedValue({
      interpretation: 'AI 白話解讀',
      caveats: ['樣本限制'],
      generatedAt: '2026-06-09T00:00:00.000Z',
    }),
  };
  const usage = {
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    incrementTokenUsage: vi.fn().mockResolvedValue(undefined),
  };
  const dedupe = new AiPromptDedupeService();
  const controller = new AiController(
    {} as SurveysService,
    {} as ResponsesService,
    aiInsights as unknown as AiInsightsService,
    usage as unknown as AiUsageService,
    {} as AiReportStoreService,
    analytics as unknown as AnalyticsService,
    dedupe,
  );
  return { controller, analytics, aiInsights, usage };
}

const req = {
  user: { id: USER } as AuthenticatedUser,
} as Request & { user: AuthenticatedUser };

const STUB_INSIGHTS: SurveyInsights = {
  reportType: 'simple',
  summary: 'test summary',
  keyFindings: ['finding'],
  concerns: [],
  recommendations: [],
  sampleSize: 10,
  generatedAt: '2026-06-09T00:00:00.000Z',
};

function makeAnalyzeController(overrides: {
  saveFn?: () => Promise<void>;
  incrementUsageFn?: () => Promise<void>;
  incrementTokenUsageFn?: () => Promise<void>;
} = {}) {
  const responses = {
    getSurveyStats: vi.fn().mockResolvedValue({ title: 'Test', totalResponses: 10, questionStats: [] }),
  };
  const aiInsights = {
    analyze: vi.fn().mockResolvedValue(STUB_INSIGHTS),
    interpretStatistics: vi.fn(),
  };
  const usage = {
    incrementUsage: vi.fn().mockImplementation(overrides.incrementUsageFn ?? (() => Promise.resolve())),
    incrementTokenUsage: vi.fn().mockImplementation(overrides.incrementTokenUsageFn ?? (() => Promise.resolve())),
    estimateTokens: vi.fn().mockReturnValue(100),
  };
  const reportStore = {
    save: vi.fn().mockImplementation(overrides.saveFn ?? (() => Promise.resolve())),
    getSaved: vi.fn(),
  };
  const dedupe = new AiPromptDedupeService();
  const controller = new AiController(
    {} as SurveysService,
    responses as unknown as ResponsesService,
    aiInsights as unknown as AiInsightsService,
    usage as unknown as AiUsageService,
    reportStore as unknown as AiReportStoreService,
    {} as AnalyticsService,
    dedupe,
  );
  return { controller, responses, aiInsights, usage, reportStore };
}

describe('AiController.analyzeResponses', () => {
  it('returns insights and generatedAt even when aiReportStore.save throws (issue #118 regression)', async () => {
    // Regression: with Promise.all, a save failure (e.g. DB schema drift) would
    // cause the whole request to fail with 500 even though insights were generated.
    // Fix: use Promise.allSettled — save is value-add, not gate-keeper.
    const { controller } = makeAnalyzeController({
      saveFn: () => Promise.reject(new Error('column daily_tokens_used does not exist')),
    });

    const result = await controller.analyzeResponses(req, {
      surveyId: SURVEY,
      reportType: 'simple',
    });

    expect(result).toMatchObject({
      summary: STUB_INSIGHTS.summary,
      reportType: 'simple',
    });
    expect(typeof result.generatedAt).toBe('string');
  });

  it('returns insights when incrementTokenUsage throws (schema drift scenario)', async () => {
    const { controller } = makeAnalyzeController({
      incrementTokenUsageFn: () => Promise.reject(new Error('column daily_tokens_used does not exist')),
    });

    const result = await controller.analyzeResponses(req, {
      surveyId: SURVEY,
      reportType: 'detailed',
    });

    expect(result).toMatchObject({ summary: STUB_INSIGHTS.summary });
  });

  it('calls incrementUsage, incrementTokenUsage, and save on success', async () => {
    const { controller, usage, reportStore } = makeAnalyzeController();

    await controller.analyzeResponses(req, { surveyId: SURVEY, reportType: 'simple' });

    expect(usage.incrementUsage).toHaveBeenCalledWith(USER, 'analyze_responses');
    expect(usage.incrementTokenUsage).toHaveBeenCalled();
    expect(reportStore.save).toHaveBeenCalledWith(SURVEY, 'simple', expect.objectContaining({ summary: STUB_INSIGHTS.summary }));
  });
});

describe('AiController.interpretStatistics', () => {
  it('prepares cross-tab values server-side before AI interpretation and charges analyze quota', async () => {
    const { controller, analytics, aiInsights, usage } = makeController();

    const result = await controller.interpretStatistics(req, {
      surveyId: SURVEY,
      analysisType: 'cross_tab',
      questionA: QA,
      questionB: QB,
    });

    expect(analytics.getCrossTab).toHaveBeenCalledWith(SURVEY, USER, QA, QB);
    expect(aiInsights.interpretStatistics).toHaveBeenCalledWith(
      expect.stringContaining('交叉分析'),
      '問卷',
      { matrix: [[2]], cramersV: 0.5 },
    );
    expect(usage.incrementUsage).toHaveBeenCalledWith(USER, 'analyze_responses');
    expect(result).toMatchObject({
      analysisType: 'cross_tab',
      chargedFeature: 'analyze_responses',
      result: { matrix: [[2]], cramersV: 0.5 },
      interpretation: 'AI 白話解讀',
    });
  });

  it('supports all advanced analysis types through the same charged AI endpoint', async () => {
    const { controller, analytics, usage } = makeController();

    await controller.interpretStatistics(req, { surveyId: SURVEY, analysisType: 'scale_reliability' });
    await controller.interpretStatistics(req, { surveyId: SURVEY, analysisType: 'nps', questionId: QA });
    await controller.interpretStatistics(req, { surveyId: SURVEY, analysisType: 'correlation', questionA: QA, questionB: QB });
    await controller.interpretStatistics(req, {
      surveyId: SURVEY,
      analysisType: 'group_comparison',
      ratingQuestionId: QA,
      groupQuestionId: QB,
    });
    await controller.interpretStatistics(req, {
      surveyId: SURVEY,
      analysisType: 'regression',
      dependentId: QA,
      independentIds: [QB],
    });
    await controller.interpretStatistics(req, { surveyId: SURVEY, analysisType: 'segmentation', k: 4 });

    expect(analytics.getScaleReliability).toHaveBeenCalledWith(SURVEY, USER, undefined, undefined);
    expect(analytics.getNps).toHaveBeenCalledWith(SURVEY, USER, QA);
    expect(analytics.getCorrelation).toHaveBeenCalledWith(SURVEY, USER, QA, QB);
    expect(analytics.getGroupComparison).toHaveBeenCalledWith(SURVEY, USER, QA, QB);
    expect(analytics.getRegression).toHaveBeenCalledWith(SURVEY, USER, QA, [QB]);
    expect(analytics.getSegmentation).toHaveBeenCalledWith(SURVEY, USER, 4);
    expect(usage.incrementUsage).toHaveBeenCalledTimes(6);
  });
});
