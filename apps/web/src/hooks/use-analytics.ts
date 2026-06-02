'use client';

import { useQuery } from '@tanstack/react-query';
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
    label: string;
    count: number;
    avgRatings: Record<string, { questionTitle: string; avg: number }>;
  }[];
  totalRespondents: number;
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
