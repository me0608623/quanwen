'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PlatformStats {
  totalUsers: number;
  totalSurveyors: number;
  totalRespondents: number;
  surveyCounts: {
    draft: number;
    pending_review: number;
    published: number;
    paused: number;
    closed: number;
    rejected: number;
  };
  totalResponses: number;
  suspiciousResponses: number;
  platformRevenue: number;
  platformRevenueThisMonth: number;
}

export interface AdminSurvey {
  id: string;
  title: string;
  surveyorId: string;
  status: string;
  aiScore: number | null;
  createdAt: string;
  publishedAt: string | null;
  questionCount: number;
}

export interface SuspiciousResponse {
  id: string;
  surveyId: string;
  surveyTitle: string;
  respondentId: string;
  status: string;
  antiCheatScore: number;
  suspiciousFlags: string[];
  submittedAt: string;
  fillDurationSeconds: number | null;
}

export function usePlatformStats() {
  return useQuery<PlatformStats>({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const { data } = await api.get('/admin/stats');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAdminSurveys(status?: string) {
  return useQuery<AdminSurvey[]>({
    queryKey: ['admin', 'surveys', status],
    queryFn: async () => {
      const params = status ? { status } : {};
      const { data } = await api.get('/admin/surveys', { params });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useApproveSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/surveys/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'surveys'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useRejectSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/admin/surveys/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'surveys'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useCloseSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/surveys/${id}/close`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'surveys'] });
    },
  });
}

export function useSuspiciousResponses() {
  return useQuery<SuspiciousResponse[]>({
    queryKey: ['admin', 'responses', 'suspicious'],
    queryFn: async () => {
      const { data } = await api.get('/admin/responses/suspicious');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useRejectResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/responses/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'responses'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

// ─── 提領管理 ─────────────────────────────────────────────────────────────────

export interface PendingWithdrawal {
  id: string;
  userId: string;
  type: string;
  amount: number;
  status: string;
  note: string | null;
  metadata: { bankCode?: string; bankAccount?: string; accountName?: string } | null;
  createdAt: string;
}

export function usePendingWithdrawals() {
  return useQuery<PendingWithdrawal[]>({
    queryKey: ['admin', 'withdrawals'],
    queryFn: async () => {
      const { data } = await api.get('/admin/withdrawals');
      return data;
    },
    staleTime: 15_000,
  });
}

export function useApproveWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/withdrawals/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useRejectWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.post(`/admin/withdrawals/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
    },
  });
}

// ─── Phase 6: 申訴管理 ──────────────────────────────────────────────────────

export interface AdminAppealRow {
  id: string;
  responseId: string;
  respondentId: string;
  reason: string;
  status: 'pending' | 'approved' | 'dismissed';
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  surveyId: string;
  qualityScore: number | null;
  surveyTitle: string;
  rewardPoints: number;
}

export function useAdminAppeals(status: 'pending' | 'approved' | 'dismissed' = 'pending') {
  return useQuery<AdminAppealRow[]>({
    queryKey: ['admin', 'appeals', status],
    queryFn: async () => {
      const { data } = await api.get<AdminAppealRow[]>(`/admin/appeals?status=${status}`);
      return data;
    },
    staleTime: 30_000,
  });
}

export function useApproveAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote?: string }) => {
      await api.post(`/admin/appeals/${id}/approve`, { adminNote: adminNote ?? '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
    },
  });
}

export function useDismissAppeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote: string }) => {
      await api.post(`/admin/appeals/${id}/dismiss`, { adminNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'appeals'] });
    },
  });
}

// ─── Phase B: KYC 管理 ──────────────────────────────────────────────────────

export interface AdminKycRow {
  id: string;
  userId: string;
  idNumber: string | null;
  realName: string | null;
  phone: string | null;
  idFrontUrl: string | null;
  idBackUrl: string | null;
  selfieUrl: string | null;
  submittedAt: string;
}

export function useAdminKycList() {
  return useQuery<AdminKycRow[]>({
    queryKey: ['admin', 'kyc'],
    queryFn: async () => {
      const { data } = await api.get<AdminKycRow[]>('/admin/kyc');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useApproveKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote?: string }) => {
      await api.post(`/admin/kyc/${id}/approve`, { adminNote: adminNote ?? '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] });
    },
  });
}

export function useRejectKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote: string }) => {
      await api.post(`/admin/kyc/${id}/reject`, { adminNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] });
    },
  });
}

// ─── AI Review (admin consultation, doesn't mutate DB) ───────────────────────

export interface SurveyAuditResult {
  score: number;
  passed: boolean;
  issues: string[];
  suggestion: string;
}

export function useSurveyAiReview(surveyId: string, enabled = false) {
  return useQuery<SurveyAuditResult>({
    queryKey: ['admin', 'ai-review', surveyId],
    queryFn: async () => {
      const { data } = await api.get<SurveyAuditResult>(`/admin/surveys/${surveyId}/ai-review`);
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ─── Suspicious Response AI Analysis ─────────────────────────────────────────

export interface SuspiciousAnalysis {
  severity: 'low' | 'medium' | 'high';
  reasoning: string;
  signals: string[];
  recommendation: 'reject' | 'review_more' | 'accept';
  recommendationReason: string;
}

export function useResponseAiAnalysis(responseId: string, enabled = false) {
  return useQuery<SuspiciousAnalysis>({
    queryKey: ['admin', 'ai-analysis', responseId],
    queryFn: async () => {
      const { data } = await api.get<SuspiciousAnalysis>(`/admin/responses/${responseId}/ai-analysis`);
      return data;
    },
    enabled: enabled && !!responseId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ─── Platform Health Summary (AI) ────────────────────────────────────────────

export interface PlatformHealthSummary {
  status: 'healthy' | 'attention' | 'critical';
  headline: string;
  highlights: string[];
  concerns: string[];
  suggestedActions: string[];
  generatedAt: string;
}

export function usePlatformHealth(enabled = false) {
  return useQuery<PlatformHealthSummary>({
    queryKey: ['admin', 'health-summary'],
    queryFn: async () => {
      const { data } = await api.get<PlatformHealthSummary>('/admin/health-summary');
      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ─── Withdrawal AI Risk Analysis ─────────────────────────────────────────────

export interface WithdrawalRisk {
  riskLevel: 'low' | 'medium' | 'high';
  redFlags: string[];
  recommendation: 'approve' | 'manual_review' | 'reject';
  reasoning: string;
}

export function useWithdrawalAiRisk(transactionId: string, enabled = false) {
  return useQuery<WithdrawalRisk>({
    queryKey: ['admin', 'wd-risk', transactionId],
    queryFn: async () => {
      const { data } = await api.get<WithdrawalRisk>(`/admin/withdrawals/${transactionId}/ai-risk`);
      return data;
    },
    enabled: enabled && !!transactionId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
