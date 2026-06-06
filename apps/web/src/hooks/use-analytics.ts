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
