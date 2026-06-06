'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SurveyTheme } from '@/hooks/use-surveys';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailableSurvey {
  id: string;
  title: string;
  description?: string;
  category?: string | null;
  rewardPoints: number;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  lotteryWinnerCount?: number | null;
  lotteryDrawMode?: 'when_full' | 'scheduled' | 'manual' | null;
  lotteryDrawAt?: string | null;
  lotteryTermsAcceptedAt?: string | null;
  targetCount: number;
  completedCount: number;
  expiresAt?: string;
  isAnonymous: boolean;
  publishedAt?: string;
  // QUA-34: 加急等級
  deadlineTier?: 'standard' | 'express' | 'urgent' | 'critical';
  // 題數（用於估算填答時間）
  questionCount?: number;
  // QUA-279: 封面圖片
  coverImageUrl?: string;
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
  // QUA-279: 題目圖片
  imageUrl?: string;
}

export interface PublicSurvey {
  id: string;
  title: string;
  description?: string;
  rewardPoints: number;
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  lotteryWinnerCount?: number | null;
  lotteryDrawMode?: 'when_full' | 'scheduled' | 'manual' | null;
  lotteryDrawAt?: string | null;
  lotteryTermsAcceptedAt?: string | null;
  isAnonymous: boolean;
  theme?: SurveyTheme | null;
  /** 歡迎頁橫幅圖（建立者上傳的封面圖） */
  coverImageUrl?: string | null;
  /** 歡迎頁可插入的多張圖片，依序顯示於描述之後 */
  welcomeImages?: string[];
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
  rewardMode?: 'fixed' | 'lottery';
  lotteryPrize?: string | null;
  lotteryWinnerCount?: number | null;
  lotteryDrawMode?: 'when_full' | 'scheduled' | 'manual' | null;
  lotteryDrawAt?: string | null;
  lotteryDrawnAt?: string | null;
  qualityScore?: number | null;
  qualityBreakdown?: {
    finalScore: number;
    status: 'passed' | 'suspicious' | 'rejected';
    flags?: string[];
    llmReasoning?: string | null;
  } | null;
  suspiciousFlags?: string[] | null;
}

export interface LotteryWinning {
  id: string;
  surveyId: string;
  surveyTitle: string;
  prize: string;
  drawnAt?: string | null;
  fulfillmentDueAt?: string | null;
  fulfillmentStatus: 'pending' | 'notified' | 'verified' | 'not_applicable';
  fulfillmentNote?: string | null;
  fulfilledAt?: string | null;
  platformVerifiedAt?: string | null;
  platformIntervenedAt?: string | null;
  platformInterventionNote?: string | null;
  platformInterventionHistory?: LotteryPlatformIntervention[];
  recipientStatus: 'awaiting_delivery' | 'received' | 'issue_reported' | 'not_applicable';
  recipientConfirmedAt?: string | null;
  recipientIssueNote?: string | null;
  recipientIssueReportedAt?: string | null;
}

export interface LotteryPlatformIntervention {
  intervenedAt: string;
  adminId: string;
  reason: 'winner_issue' | 'fulfillment_overdue';
  note: string;
}

export interface LotteryResult extends LotteryWinning {
  isWinner: boolean;
  participantCount: number;
  drawAuditVerified: boolean | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useAvailableSurveys(category?: string) {
  return useQuery<AvailableSurvey[]>({
    queryKey: ['tasks', 'available', category ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get('/tasks', { params: category ? { category } : undefined });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useTaskCategoryCounts() {
  return useQuery<Record<string, number>>({
    queryKey: ['tasks', 'category-counts'],
    queryFn: async () => {
      const { data } = await api.get('/tasks/category-counts');
      return data;
    },
    staleTime: 60_000,
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

export function usePublicLinkSurvey(id: string) {
  return useQuery<PublicSurvey>({
    queryKey: ['public-tasks', id],
    queryFn: async () => {
      const { data } = await api.get(`/public/tasks/${id}`);
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

export function useLotteryWinnings() {
  return useQuery<LotteryWinning[]>({
    queryKey: ['tasks', 'lottery-winnings'],
    queryFn: async () => {
      const { data } = await api.get<LotteryWinning[]>('/tasks/lottery-winnings');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useLotteryResults() {
  return useQuery<LotteryResult[]>({
    queryKey: ['tasks', 'lottery-results'],
    queryFn: async () => {
      const { data } = await api.get<LotteryResult[]>('/tasks/lottery-results');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useConfirmLotteryReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/tasks/lottery-winnings/${id}/confirm-receipt`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'lottery-winnings'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'lottery-results'] });
    },
  });
}

export function useReportLotteryIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { data } = await api.post(`/tasks/lottery-winnings/${id}/report-issue`, { note });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'lottery-winnings'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'lottery-results'] });
    },
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

export function useSubmitPublicResponse(surveyId: string, anonToken: string) {
  return useMutation({
    mutationFn: async ({ answers, startedAt, behaviorLog }: {
      answers: AnswerInput[];
      startedAt?: string;
      behaviorLog?: unknown;
    }) => {
      const { data } = await api.post(`/public/tasks/${surveyId}/submit`, { answers, startedAt, behaviorLog }, {
        headers: { 'x-anon-token': anonToken },
      });
      return data as { message: string; responseId: string; flagged: boolean };
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
