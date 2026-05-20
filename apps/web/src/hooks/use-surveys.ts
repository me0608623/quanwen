'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── AI Insights ──────────────────────────────────────────────────────────────

export interface SurveyAiInsights {
  summary: string;
  keyFindings: string[];
  concerns: string[];
  recommendations: string[];
  sampleSize: number;
  generatedAt: string;
}

/** 取得問卷 AI 洞察報告（lazy：要 enabled 才會 fetch）*/
export function useSurveyAiInsights(surveyId: string, enabled = false) {
  return useQuery<SurveyAiInsights>({
    queryKey: ['surveys', surveyId, 'ai-insights'],
    queryFn: async () => {
      const { data } = await api.get<SurveyAiInsights>(`/surveys/${surveyId}/ai-insights`);
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 5 * 60 * 1000, // 5 min — LLM 結果不會頻繁變動
    retry: 0,
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionOption {
  id?: string;
  label: string;
  sortOrder: number;
}

export interface SurveyQuestion {
  id?: string;
  type: 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  config?: Record<string, unknown>;
  options?: QuestionOption[];
}

export interface AudienceCriteria {
  ageRange?: string[];
  gender?: string[];
  region?: string[];
  occupation?: string[];
  education?: string[];
  minReputationScore?: number;
  // Phase G.6
  requiredTagIds?: string[];
  tagMatchMode?: 'any' | 'all';
}

/**
 * Phase G.1: 跳題邏輯
 * 存在 question.config.skipLogic：
 *   - selectedOptionId: 受試者選了哪個 option 就觸發
 *   - skipToQuestionIndex: 跳到第 N 題（sortOrder）
 *   - skipToEnd: true 代表直接結束問卷
 */
export interface SkipLogicRule {
  selectedOptionId?: string;     // for single_choice
  selectedRating?: number;       // for rating
  skipToQuestionIndex?: number;  // sortOrder of target
  skipToEnd?: boolean;
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'pending_review' | 'published' | 'paused' | 'closed' | 'rejected';
  rewardPoints: number;
  targetCount: number;
  completedCount: number;
  expiresAt?: string;
  isAnonymous: boolean;
  aiScore?: number;
  aiRejectReason?: string;
  audienceCriteria?: AudienceCriteria | null;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  questions: SurveyQuestion[];
}

export interface AiDraftResult {
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useMySurveys() {
  return useQuery<Survey[]>({
    queryKey: ['surveys', 'mine'],
    queryFn: async () => {
      const { data } = await api.get('/surveys');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSurvey(id: string) {
  return useQuery<Survey>({
    queryKey: ['surveys', id],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateSurvey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: Partial<Survey> & { questions?: SurveyQuestion[] }) => {
      const { data } = await api.post<Survey>('/surveys', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys', 'mine'] });
    },
  });
}

export function useUpdateSurvey(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: Partial<Survey> & { questions?: SurveyQuestion[] }) => {
      const { data } = await api.put<Survey>(`/surveys/${id}`, dto);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['surveys', id], data);
      queryClient.invalidateQueries({ queryKey: ['surveys', 'mine'] });
    },
  });
}

export function usePublishSurvey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/surveys/${id}/publish`);
      return data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['surveys', id] });
      queryClient.invalidateQueries({ queryKey: ['surveys', 'mine'] });
    },
  });
}

export function useDeleteSurvey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/surveys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys', 'mine'] });
    },
  });
}

export function useAiDraft() {
  return useMutation({
    mutationFn: async (dto: {
      topic: string;
      questionCount?: number;
      language?: string;
      targetAudience?: string;
    }) => {
      const { data } = await api.post<AiDraftResult>('/surveys/ai-draft', {
        questionCount: 8,
        language: 'zh-TW',
        ...dto,
      });
      return data;
    },
  });
}

export interface TrendPoint {
  date: string;
  count: number;
}

export function useSurveyTrend(surveyId: string) {
  return useQuery<TrendPoint[]>({
    queryKey: ['surveys', surveyId, 'trend'],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${surveyId}/trend`);
      return data;
    },
    enabled: !!surveyId,
    staleTime: 60_000,
  });
}

export interface BudgetCheck {
  sufficient: boolean;
  walletBalance: number;
  requiredAmount: number;
}

export function useBudgetCheck(surveyId: string, enabled = true) {
  return useQuery<BudgetCheck>({
    queryKey: ['surveys', surveyId, 'budget-check'],
    queryFn: async () => {
      const { data } = await api.get(`/surveys/${surveyId}/budget-check`);
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 10_000,
  });
}

// ─── Surveyor Assistant (AI next-step recommendation) ────────────────────────

export interface AssistantRecommendation {
  primaryAction: {
    label: string;
    surveyId?: string;
    surveyTitle?: string;
    reason: string;
  };
  insights: string[];
  alerts: Array<{
    severity: 'info' | 'warning';
    message: string;
    surveyId?: string;
  }>;
  generatedAt: string;
}

export function useSurveyorAssistant(enabled = false) {
  return useQuery<AssistantRecommendation>({
    queryKey: ['surveys', 'assistant'],
    queryFn: async () => {
      const { data } = await api.get<AssistantRecommendation>('/surveys/assistant');
      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ─── Text Question Sentiment ────────────────────────────────────────────────

export interface TextSentimentResult {
  question: string;
  sampleSize: number;
  positive: number;
  neutral: number;
  negative: number;
  themes: Array<{
    label: string;
    frequency: 'high' | 'medium' | 'low';
    examples: string[];
  }>;
  generatedAt: string;
}

export function useQuestionSentiment(surveyId: string, questionId: string, enabled = false) {
  return useQuery<TextSentimentResult>({
    queryKey: ['surveys', surveyId, 'sentiment', questionId],
    queryFn: async () => {
      const { data } = await api.get<TextSentimentResult>(`/surveys/${surveyId}/questions/${questionId}/sentiment`);
      return data;
    },
    enabled: enabled && !!surveyId && !!questionId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ─── AI Improve Suggestion ──────────────────────────────────────────────────

export interface SurveyImproveResult {
  overallScore: number;
  strengths: string[];
  weaknesses: Array<{
    questionIndex: number;
    issue: string;
    suggestion: string;
  }>;
  missingTypes: string[];
  wordingTips: string[];
}

export function useSurveyAiImprove(surveyId: string, enabled = false) {
  return useQuery<SurveyImproveResult>({
    queryKey: ['surveys', surveyId, 'ai-improve'],
    queryFn: async () => {
      const { data } = await api.get<SurveyImproveResult>(`/surveys/${surveyId}/ai-improve`);
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

// ─── Phase 4: 設計階段反作弊輔助 ─────────────────────────────────────────

export interface AttentionCheckSuggestion {
  insertAfterIndex: number;
  question: {
    type: 'single_choice' | 'text';
    title: string;
    options?: Array<{ label: string }>;
    correctValue: string;
    kind: 'instruction' | 'common_sense' | 'arithmetic';
    reasoning: string;
  };
}

export interface AntiCheatSuggestionResult {
  checks: AttentionCheckSuggestion[];
  note?: string;
}

export function useAntiCheatSuggestions(surveyId: string, enabled = false) {
  return useQuery<AntiCheatSuggestionResult>({
    queryKey: ['surveys', surveyId, 'ai-design', 'anti-cheat'],
    queryFn: async () => {
      const { data } = await api.get<AntiCheatSuggestionResult>(
        `/surveys/${surveyId}/ai-design/anti-cheat`,
      );
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}

export interface PreReviewRedFlag {
  severity: 'high' | 'medium' | 'low';
  issue: string;
  questionIndex: number | null;
  suggestedFix: string;
}

export interface PreReviewResult {
  decision: 'approve' | 'approve_with_changes' | 'reject';
  score: number;
  redFlags: PreReviewRedFlag[];
  warnings: string[];
  compliments: string[];
  estimatedCompletionRate: number;
  hasAntiCheatMechanism: boolean;
  summaryForSurveyor: string;
}

export function usePreReview(surveyId: string, enabled = false) {
  return useQuery<PreReviewResult>({
    queryKey: ['surveys', surveyId, 'ai-design', 'pre-review'],
    queryFn: async () => {
      const { data } = await api.get<PreReviewResult>(
        `/surveys/${surveyId}/ai-design/pre-review`,
      );
      return data;
    },
    enabled: enabled && !!surveyId,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
}
