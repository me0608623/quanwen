'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DescriptiveStats {
  mean: number | null;
  median: number | null;
  mode: number | null;
  stddev: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface CrossTabResult {
  questionA: { id: string; title: string };
  questionB: { id: string; title: string };
  rows: string[];
  cols: string[];
  matrix: number[][];
  cramersV: number | null;
}

export interface NpsResult {
  questionId: string;
  title: string;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  nps: number | null;
  scaleMin: number;
  scaleMax: number;
  normalizedToTenPointScale: boolean;
}

export interface ScaleReliabilityResult {
  itemCount: number;
  completeResponseCount: number;
  excludedIncompleteResponseCount: number;
  normalizedToCommonScale: boolean;
  cronbachAlpha: number | null;
  mcdonaldsOmega: number | null;
  interpretation: string;
  availableItems: Array<{
    questionId: string;
    title: string;
    reverseScored: boolean;
    selectedForScale: boolean;
  }>;
  items: Array<{
    questionId: string;
    title: string;
    mean: number | null;
    rawMean: number | null;
    reverseScored: boolean;
    selectedForScale: boolean;
    correctedItemTotalCorrelation: number | null;
    alphaIfDeleted: number | null;
  }>;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useDescriptiveStats(surveyId: string, questionId?: string, enabled = true) {
  return useQuery<Record<string, DescriptiveStats>>({
    queryKey: ['analytics', surveyId, 'descriptive', questionId],
    queryFn: async () => {
      const params = questionId ? `?questionId=${questionId}` : '';
      const { data } = await api.get(`/surveys/${surveyId}/analytics/descriptive${params}`);
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 60_000,
  });
}

export function useScaleReliability(surveyId: string, questionIds?: string[], reverseQuestionIds?: string[], enabled = true) {
  return useQuery<ScaleReliabilityResult>({
    queryKey: ['analytics', surveyId, 'scale-reliability', questionIds, reverseQuestionIds],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${surveyId}/analytics/scale-reliability`, {
        params: {
          ...(questionIds?.length ? { questionIds: questionIds.join(',') } : {}),
          ...(reverseQuestionIds ? { reverseQuestionIds: reverseQuestionIds.join(',') } : {}),
        },
      });
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 60_000,
  });
}

export function useSaveScaleSettings(surveyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ questionIds, reverseQuestionIds }: { questionIds: string[]; reverseQuestionIds: string[] }) => {
      const { data } = await api.patch(`/surveys/${surveyId}/analytics/scale-settings`, { questionIds, reverseQuestionIds });
      return data as ScaleReliabilityResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', surveyId, 'scale-reliability'] });
    },
  });
}

export function useCrossTab(
  surveyId: string,
  questionA?: string,
  questionB?: string,
  enabled = true,
) {
  return useQuery<CrossTabResult>({
    queryKey: ['analytics', surveyId, 'cross-tab', questionA, questionB],
    queryFn: async () => {
      const { data } = await api.get(
        `/surveys/${surveyId}/analytics/cross-tab?questionA=${questionA}&questionB=${questionB}`,
      );
      return data;
    },
    enabled: enabled && !!surveyId && !!questionA && !!questionB,
    staleTime: 60_000,
  });
}

export interface CorrelationResult {
  questionA: { id: string; title: string };
  questionB: { id: string; title: string };
  pearsonR: number | null;
  n: number;
  interpretation: string;
}

export interface SegmentationResult {
  segments: {
    segmentId: string;
    label: string;
    count: number;
    avgRatings: Record<string, {
      questionTitle: string;
      avg: number | null;
      scaleMin: number;
      scaleMax: number;
      relativeAvg: number | null;
      answeredCount: number;
    }>;
    choiceProfiles: Record<string, {
      questionTitle: string;
      topOptions: { label: string; pct: number }[];
    }>;
  }[];
  totalRespondents: number;
  normalizedToCommonScale: boolean;
}

export function useNps(surveyId: string, questionId?: string, enabled = true) {
  return useQuery<NpsResult>({
    queryKey: ['analytics', surveyId, 'nps', questionId],
    queryFn: async () => {
      const { data } = await api.get(
        `/surveys/${surveyId}/analytics/nps?questionId=${questionId}`,
      );
      return data;
    },
    enabled: enabled && !!surveyId && !!questionId,
    staleTime: 60_000,
  });
}

export function useCorrelation(
  surveyId: string,
  questionA?: string,
  questionB?: string,
  enabled = true,
) {
  return useQuery<CorrelationResult>({
    queryKey: ['analytics', surveyId, 'correlation', questionA, questionB],
    queryFn: async () => {
      const { data } = await api.get(
        `/surveys/${surveyId}/analytics/correlation?questionA=${questionA}&questionB=${questionB}`,
      );
      return data;
    },
    enabled: enabled && !!surveyId && !!questionA && !!questionB,
    staleTime: 60_000,
  });
}

export interface GroupComparisonResult {
  ratingQuestion: { id: string; title: string };
  groupQuestion: { id: string; title: string };
  groups: Array<{ optionId: string; label: string; n: number; mean: number | null; stddev: number }>;
  test: {
    type: 't' | 'anova';
    statistic: number;
    df1: number;
    df2: number | null;
    p: number;
    effectSize: number | null;
    effectSizeLabel: string | null;
  } | null;
  interpretation: string;
}

export interface RegressionResult {
  dependent: { id: string; title: string };
  predictors: Array<{
    id: string;
    title: string;
    coefficient: number | null;
    standardizedBeta: number | null;
    tStat: number | null;
    p: number | null;
  }>;
  intercept: number | null;
  rSquared: number | null;
  adjustedRSquared: number | null;
  n: number;
  interpretation: string;
}

export type AdvancedAnalysisType =
  | 'cross_tab'
  | 'scale_reliability'
  | 'nps'
  | 'correlation'
  | 'group_comparison'
  | 'regression'
  | 'segmentation';

export interface StatisticsInterpretation {
  analysisType: AdvancedAnalysisType;
  chargedFeature: 'analyze_responses';
  result: unknown;
  interpretation: string;
  caveats: string[];
  generatedAt: string;
}

export function useGroupComparison(
  surveyId: string,
  ratingQuestionId?: string,
  groupQuestionId?: string,
  enabled = true,
) {
  return useQuery<GroupComparisonResult>({
    queryKey: ['analytics', surveyId, 'group-comparison', ratingQuestionId, groupQuestionId],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${surveyId}/analytics/group-comparison`, {
        params: { ratingQuestionId, groupQuestionId },
      });
      return data;
    },
    enabled: enabled && !!surveyId && !!ratingQuestionId && !!groupQuestionId,
    staleTime: 60_000,
  });
}

export function useRegression(
  surveyId: string,
  dependentId?: string,
  independentIds: string[] = [],
  enabled = true,
) {
  return useQuery<RegressionResult>({
    queryKey: ['analytics', surveyId, 'regression', dependentId, independentIds],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${surveyId}/analytics/regression`, {
        params: { dependentId, independentIds: independentIds.join(',') },
      });
      return data;
    },
    enabled: enabled && !!surveyId && !!dependentId && independentIds.length > 0,
    staleTime: 60_000,
  });
}

export type InterpretPayload =
  | { surveyId: string; analysisType: 'cross_tab'; questionA: string; questionB: string }
  | { surveyId: string; analysisType: 'scale_reliability'; questionIds?: string[]; reverseQuestionIds?: string[] }
  | { surveyId: string; analysisType: 'nps'; questionId: string }
  | { surveyId: string; analysisType: 'correlation'; questionA: string; questionB: string }
  | { surveyId: string; analysisType: 'group_comparison'; ratingQuestionId: string; groupQuestionId: string }
  | { surveyId: string; analysisType: 'regression'; dependentId: string; independentIds: string[] }
  | { surveyId: string; analysisType: 'segmentation'; k?: number };

export function useInterpretStatistics() {
  return useMutation<StatisticsInterpretation, unknown, InterpretPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post('/ai/interpret-statistics', payload);
      return data;
    },
  });
}

export function useSegmentation(surveyId: string, k = 3, enabled = true) {
  return useQuery<SegmentationResult>({
    queryKey: ['analytics', surveyId, 'segmentation', k],
    queryFn: async () => {
      const { data } = await api.get(
        `/surveys/${surveyId}/analytics/segmentation?k=${k}`,
      );
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 60_000,
  });
}

// ─── Batch Analysis Types & Hooks ────────────────────────────────────────────

export type BatchAnalysisPayload = { analyses: InterpretPayload[] };

export type BatchAnalysisResult = {
  results: Array<{
    analysisType: AdvancedAnalysisType;
    costType: 'ai' | 'points';
    result: unknown;
    interpretation: string;
    summary: string;
  }>;
  aiUsed: number;
  pointsUsed: number;
};

export type BatchCostPreview = {
  total: number;
  aiCovered: number;
  pointsCovered: number;
  pointsRequired: number;
  pointsAvailable: number;
  canProceed: boolean;
};

export type BatchAnalysisError =
  | { code: '422_points_insufficient'; message: string; needed: number; available: number }
  | { code: '429_ai_quota'; message: string }
  | { code: 'unknown'; message: string };

export function useBatchInterpretStatistics() {
  return useMutation<BatchAnalysisResult, BatchAnalysisError, BatchAnalysisPayload>({
    mutationFn: async (payload) => {
      try {
        const { data } = await api.post<BatchAnalysisResult>('/ai/interpret-statistics/batch', payload);
        return data;
      } catch (err) {
        const axiosErr = err as { response?: { status?: number; data?: { message?: string; needed?: number; available?: number } } };
        const status = axiosErr.response?.status;
        const body = axiosErr.response?.data;
        if (status === 422) {
          throw { code: '422_points_insufficient' as const, message: body?.message ?? '積分不足', needed: body?.needed ?? 0, available: body?.available ?? 0 };
        }
        if (status === 429) {
          throw { code: '429_ai_quota' as const, message: body?.message ?? 'AI 分析額度已用完' };
        }
        throw { code: 'unknown' as const, message: body?.message ?? '分析失敗，請稍後再試' };
      }
    },
  });
}

// TODO: switch to real endpoint when backend GET /ai/interpret-statistics/batch/cost-preview is ready
export function useBatchCostPreview(count: number, enabled = true) {
  return useQuery<BatchCostPreview>({
    queryKey: ['ai', 'batch-cost-preview', count],
    queryFn: async () => {
      const { data } = await api.get<BatchCostPreview>('/ai/interpret-statistics/batch/cost-preview', {
        params: { count },
      });
      return data;
    },
    enabled: enabled && count > 0,
    staleTime: 10_000,
  });
}
