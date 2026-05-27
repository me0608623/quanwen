'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type MutualStatus =
  | 'waiting'
  | 'matched'
  | 'a_done'
  | 'b_done'
  | 'both_done'
  | 'expired'
  | 'cancelled';

export type MutualNextAction =
  | 'wait_match'
  | 'fill_other'
  | 'wait_other_fill'
  | 'unlocked'
  | 'expired_or_dead';

export interface MutualSide {
  userId: string;
  displayName: string;
  reputationScore: number | null;
  surveyId: string;
  surveyTitle: string;
  filledAt: string | null;
  responseId: string | null;
}

export interface MutualPair {
  id: string;
  status: MutualStatus;
  matchedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  iAm: 'a' | 'b';
  self: MutualSide;
  other: MutualSide | null;
  nextAction: MutualNextAction;
}

export interface MutualQuestion {
  id: string;
  surveyId: string;
  type: 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';
  title: string;
  description: string | null;
  sortOrder: number;
  isRequired: boolean;
  config: Record<string, unknown> | null;
  options: Array<{ id: string; label: string; sortOrder: number }>;
}

export interface MutualUnlockedAnswer {
  textAnswer: string | null;
  selectedOptionIds: string[] | null;
  ratingValue: number | null;
}

export interface MutualUnlockedQuestion {
  id: string;
  title: string;
  type: 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';
  sortOrder: number;
  options: Array<{ id: string; label: string; sortOrder: number }>;
  answer: MutualUnlockedAnswer | null;
}

export interface MutualUnlocked {
  mySurveyTitle: string;
  otherDisplayName: string;
  questions: MutualUnlockedQuestion[];
}

export interface MutualPairDetail {
  pair: {
    id: string;
    status: MutualStatus;
    aUserId: string;
    aSurveyId: string;
    aResponseId: string | null;
    aFilledAt: string | null;
    bUserId: string | null;
    bSurveyId: string | null;
    bResponseId: string | null;
    bFilledAt: string | null;
    aProofUrl: string | null;
    bProofUrl: string | null;
    aRating: number | null;
    bRating: number | null;
    matchedAt: string | null;
    expiresAt: string | null;
  };
  survey: {
    id: string;
    title: string;
    description: string | null;
    externalUrl?: string | null;
    questions: MutualQuestion[];
  } | null;
  unlocked: MutualUnlocked | null;
}

export function useMyMutualPairs() {
  return useQuery<MutualPair[]>({
    queryKey: ['mutual', 'mine'],
    queryFn: async () => {
      const { data } = await api.get<MutualPair[]>('/mutual');
      return data;
    },
    staleTime: 10_000,
    refetchInterval: 30_000, // 自動偵測新配對
  });
}

export function useMutualPoolStats() {
  return useQuery<{ waiting: number; myWaiting: number }>({
    queryKey: ['mutual', 'pool-stats'],
    queryFn: async () => {
      const { data } = await api.get<{ waiting: number; myWaiting: number }>('/mutual/pool-stats');
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export interface MutualMyStats {
  total: number;
  byStatus: Partial<Record<MutualStatus, number>>;
  successRate: number;
}

export function useMyMutualStats() {
  return useQuery<MutualMyStats>({
    queryKey: ['mutual', 'my-stats'],
    queryFn: async () => {
      const { data } = await api.get<MutualMyStats>('/mutual/my-stats');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useMutualPair(id: string | undefined) {
  return useQuery<MutualPairDetail>({
    queryKey: ['mutual', id],
    queryFn: async () => {
      const { data } = await api.get<MutualPairDetail>(`/mutual/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 5_000,
  });
}

interface SubmitMutualPayload {
  pairId: string;
  answers: Array<{
    questionId: string;
    textAnswer?: string;
    selectedOptionIds?: string[];
    ratingValue?: number;
  }>;
}

export function useSubmitMutualResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SubmitMutualPayload) => {
      const { data } = await api.post<{ responseId: string; pairId: string }>(
        `/mutual/${payload.pairId}/submit`,
        { answers: payload.answers },
      );
      return data;
    },
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['mutual'] });
      queryClient.invalidateQueries({ queryKey: ['mutual', payload.pairId] });
    },
  });
}

export function useReEnqueueMutual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (surveyId: string) => {
      const { data } = await api.post<{ pairId: string }>(`/mutual/re-enqueue/${surveyId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mutual'] });
    },
  });
}

export function useSubmitMutualProof() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pairId, proofUrl }: { pairId: string; proofUrl: string }) => {
      const { data } = await api.post<{ pairId: string; status: string }>(`/mutual/${pairId}/proof`, { proofUrl });
      return data;
    },
    onSuccess: (_, p) => {
      queryClient.invalidateQueries({ queryKey: ['mutual'] });
      queryClient.invalidateQueries({ queryKey: ['mutual', p.pairId] });
    },
  });
}

export function useRateMutual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pairId, rating }: { pairId: string; rating: number }) => {
      const { data } = await api.post<{ pairId: string; rating: number; otherReputationDelta: number }>(`/mutual/${pairId}/rate`, { rating });
      return data;
    },
    onSuccess: (_, p) => {
      queryClient.invalidateQueries({ queryKey: ['mutual'] });
      queryClient.invalidateQueries({ queryKey: ['mutual', p.pairId] });
    },
  });
}
