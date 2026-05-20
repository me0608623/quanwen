'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailableSurvey {
  id: string;
  title: string;
  description?: string;
  rewardPoints: number;
  targetCount: number;
  completedCount: number;
  expiresAt?: string;
  isAnonymous: boolean;
  publishedAt?: string;
}

export interface PublicQuestion {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  config?: Record<string, unknown>;
  options: { id: string; label: string; sortOrder: number }[];
}

export interface PublicSurvey {
  id: string;
  title: string;
  description?: string;
  rewardPoints: number;
  isAnonymous: boolean;
  alreadySubmitted: boolean;
  questions: PublicQuestion[];
}

export interface AnswerInput {
  questionId: string;
  textAnswer?: string;
  selectedOptionIds?: string[];
  ratingValue?: number;
}

export interface MyResponseRecord {
  responseId: string;
  surveyId: string;
  status: string;
  submittedAt?: string;
  surveyTitle: string;
  rewardPoints: number;
  qualityScore?: number | null;
  qualityBreakdown?: {
    finalScore: number;
    status: 'passed' | 'suspicious' | 'rejected';
    flags?: string[];
    llmReasoning?: string | null;
  } | null;
  suspiciousFlags?: string[] | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAvailableSurveys() {
  return useQuery<AvailableSurvey[]>({
    queryKey: ['tasks', 'available'],
    queryFn: async () => {
      const { data } = await api.get('/tasks');
      return data;
    },
    staleTime: 30_000,
  });
}

export function usePublicSurvey(id: string) {
  return useQuery<PublicSurvey>({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data } = await api.get(`/tasks/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useMyResponses() {
  return useQuery<MyResponseRecord[]>({
    queryKey: ['tasks', 'history'],
    queryFn: async () => {
      const { data } = await api.get('/tasks/history');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSubmitResponse(surveyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ answers, startedAt, behaviorLog }: {
      answers: AnswerInput[];
      startedAt?: string;
      behaviorLog?: unknown;  // BehaviorLog from behavior-tracker.ts
    }) => {
      const { data } = await api.post(`/tasks/${surveyId}/submit`, { answers, startedAt, behaviorLog });
      return data as { message: string; responseId: string; flagged: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'available'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', surveyId] });
    },
  });
}

// ─── Respondent AI Assistant ────────────────────────────────────────────────

export interface RespondentAssistantData {
  topPick: {
    surveyId: string;
    title: string;
    reward: number;
    reason: string;
  } | null;
  earnings: {
    completed: number;
    totalEarned: number;
    weeklyPotential: number;
  };
  tips: string[];
  generatedAt: string;
}

// ─── Phase 6: 申訴 ────────────────────────────────────────────────────────

export interface MyAppealRecord {
  id: string;
  responseId: string;
  reason: string;
  status: 'pending' | 'approved' | 'dismissed';
  adminNote?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export function useMyAppeals() {
  return useQuery<MyAppealRecord[]>({
    queryKey: ['tasks', 'appeals'],
    queryFn: async () => {
      const { data } = await api.get<MyAppealRecord[]>('/tasks/appeals');
      return data;
    },
    staleTime: 30_000,
  });
}

export interface ReputationHistoryItem {
  id: string;
  delta: number;
  newScore: number;
  reason: string;
  createdAt: string;
}

export function useMyReputationHistory() {
  return useQuery<ReputationHistoryItem[]>({
    queryKey: ['tasks', 'reputation', 'history'],
    queryFn: async () => {
      const { data } = await api.get<ReputationHistoryItem[]>('/tasks/reputation/history');
      return data;
    },
    staleTime: 60_000,
  });
}

export function useCreateAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ responseId, reason }: { responseId: string; reason: string }) => {
      const { data } = await api.post<{ message: string; appeal: MyAppealRecord }>(
        `/tasks/responses/${responseId}/appeal`,
        { reason },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'appeals'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'history'] });
    },
  });
}

export function useRespondentAssistant(enabled = false) {
  return useQuery<RespondentAssistantData>({
    queryKey: ['tasks', 'assistant'],
    queryFn: async () => {
      const { data } = await api.get<RespondentAssistantData>('/tasks/assistant');
      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
