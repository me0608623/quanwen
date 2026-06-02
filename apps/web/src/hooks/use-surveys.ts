'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ─── AI Insights ──────────────────────────────────────────────────────────────

export type ReportType = 'simple' | 'detailed';

export interface SurveyAiInsights {
  reportType: ReportType;
  summary: string;
  keyFindings: string[];
  concerns: string[];
  recommendations: string[];
  // detailed 報告才有：
  questionBreakdown?: Array<{ question: string; insight: string }>;
  crossFindings?: string[];
  methodology?: string;
  sampleSize: number;
  generatedAt: string;
}

export interface AiUsageSnapshot {
  tier: 'free' | 'vip' | 'vvip';
  limits: {
    optimizeSurvey: number;
    generateQuestions: number;
    analyzeResponses: number;
  };
  used: {
    optimizeSurvey: number;
    generateQuestions: number;
    analyzeResponses: number;
  };
  remaining: {
    optimizeSurvey: number;
    generateQuestions: number;
    analyzeResponses: number;
  };
}

export function useAiUsage(enabled = true) {
  return useQuery<AiUsageSnapshot>({
    queryKey: ['user', 'ai-usage'],
    queryFn: async () => {
      const { data } = await api.get<AiUsageSnapshot>('/user/usage');
      return data;
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * 取得問卷 AI 洞察報告（lazy：要 enabled 才會 fetch）
 * @param reportType simple = 精簡摘要；detailed = 詳細報告（逐題 + 交叉 + 方法）
 */
export function useSurveyAiInsights(
  surveyId: string,
  enabled = false,
  reportType: ReportType = 'simple',
) {
  return useQuery<SurveyAiInsights>({
    queryKey: ['surveys', surveyId, 'ai-insights', reportType],
    queryFn: async () => {
      const { data } = await api.post<SurveyAiInsights>(
        '/ai/analyze-responses',
        { surveyId, reportType },
        { timeout: 120_000 },
      );
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
  // QUA-279: 題目圖片
  imageUrl?: string;
}

export interface AudienceCriteria {
  ageRange?: string[];
  gender?: string[];
  region?: string[];
  occupation?: string[];
  industry?: string[];
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

export type SurveyCategory =
  | 'consumer'
  | 'academic'
  | 'wellness'
  | 'workplace'
  | 'lifestyle'
  | 'tech'
  | 'social'
  | 'education'
  | 'finance'
  | 'other';

export const SURVEY_CATEGORY_LABELS: Record<SurveyCategory, string> = {
  consumer:  '消費者調查',
  academic:  '學術研究',
  wellness:  '健康健身',
  workplace: '職場工作',
  lifestyle: '生活風格',
  tech:      '科技產品',
  social:    '社會議題',
  education: '教育學習',
  finance:   '金融投資',
  other:     '其他',
};

export type DeadlineTier = 'standard' | 'express' | 'urgent' | 'critical';

export const DEADLINE_TIER_OPTIONS: Array<{
  value: DeadlineTier;
  label: string;
  days: number;
  multiplier: number;
  hint: string;
}> = [
  { value: 'standard', label: '標準 (14天)',  days: 14, multiplier: 1.00, hint: '基準費率' },
  { value: 'express',  label: '快速 (7天)',   days: 7,  multiplier: 1.20, hint: '+20% 獎勵' },
  { value: 'urgent',   label: '緊急 (3天)',   days: 3,  multiplier: 1.50, hint: '+50% 獎勵' },
  { value: 'critical', label: '超急 (24小時)', days: 1,  multiplier: 1.75, hint: '+75% 獎勵，未達標全額退款' },
];

export interface SurveyTheme {
  accentColor?: string;
  backgroundColor?: string;
  fontFamily?: 'sans' | 'serif' | 'rounded';
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  theme?: SurveyTheme | null;
  status: 'draft' | 'pending_review' | 'published' | 'paused' | 'closed' | 'rejected';
  type?: 'standard' | 'mutual';
  category?: SurveyCategory | null;
  aiReviewEnabled?: boolean;
  externalUrl?: string | null;
  rewardPoints: number;
  baseRewardPoints?: number;
  deadlineTier?: DeadlineTier;
  targetCount: number;
  completedCount: number;
  expiresAt?: string;
  isAnonymous: boolean;
  aiScore?: number;
  aiRejectReason?: string;
  audienceCriteria?: AudienceCriteria | null;
  // QUA-279: 封面圖片
  coverImageUrl?: string;
  // QUA-201: Scheduled publish and auto-close
  scheduledPublishAt?: string | null;
  autoCloseAt?: string | null;
  autoCloseAfterN?: number | null;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  questions: SurveyQuestion[];
}

export interface AiDraftResult {
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  // Phase II.12: normalize 過程的自動調整提醒（如「選項不足已改開放題」）
  notes?: string[];
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
      const { data } = await api.patch<Survey>(`/surveys/${id}`, dto);
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: {
      topic: string;
      purpose?: string;
      questionCount?: number;
      language?: string;
      targetAudience?: string;
      preferredTypes?: Array<'single_choice' | 'multiple_choice' | 'text' | 'rating'>;
      // Phase II.15: 逐題型題數(含學術量表變體)
      typeSpecs?: Array<{
        type:
          | 'single_choice'
          | 'multiple_choice'
          | 'text'
          | 'rating'
          | 'scale_agreement'
          | 'scale_frequency';
        count: number;
      }>;
      avoidTitles?: string[];
    }) => {
      const { data } = await api.post<AiDraftResult>(
        '/ai/generate-questions',
        {
          questionCount: 8,
          language: 'zh-TW',
          ...dto,
        },
        { timeout: 120_000 }, // AI 生成較慢,給足時間;逾時轉成錯誤而非無限轉圈
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'ai-usage'] });
    },
  });
}

// Phase II.14: 單題重生
export interface RegenerateQuestionResult {
  question: SurveyQuestion;
  notes: string[];
}

export function useRegenerateQuestion() {
  return useMutation({
    mutationFn: async (dto: {
      topic: string;
      purpose?: string;
      currentTitle: string;
      otherTitles?: string[];
      direction?: string;
      preferredType?: 'single_choice' | 'multiple_choice' | 'text' | 'rating';
    }) => {
      const { data } = await api.post<RegenerateQuestionResult>(
        '/surveys/ai-regenerate-question',
        { otherTitles: [], ...dto },
        { timeout: 120_000 },
      );
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

// ─── Respondents (anonymized tokens) ────────────────────────────────────────

export interface Respondent {
  anonymousToken: string;
  status: string;
  submittedAt: string | null;
  fillDurationSeconds: number | null;
  qualityScore: number | null;
}

export interface RespondentsPage {
  total: number;
  page: number;
  pageSize: number;
  respondents: Respondent[];
}

export function useRespondents(surveyId: string, page = 1, pageSize = 20) {
  return useQuery<RespondentsPage>({
    queryKey: ['surveys', surveyId, 'respondents', page, pageSize],
    queryFn: async () => {
      const { data } = await api.get<RespondentsPage>(
        `/surveys/${surveyId}/respondents?page=${page}&pageSize=${pageSize}`,
      );
      return data;
    },
    enabled: !!surveyId,
    staleTime: 30_000,
  });
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
      const { data } = await api.post<SurveyImproveResult>(
        '/ai/optimize-survey',
        { surveyId },
        { timeout: 120_000 },
      );
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
        { timeout: 120_000 },
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

// ─── Survey Import (QUA-236 / QUA-239) ──────────────────────────────────────

export interface ImportResult {
  id: string;
  status: string;
  questionsCount: number;
  warnings: string[];
}

export interface GoogleFormsImportResult extends ImportResult {
  skippedFromSource: { type: string; title: string }[];
}

export function useImportJson() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, Record<string, unknown>>({
    mutationFn: async (surveyJson) => {
      const { data } = await api.post<{ success: boolean; data: ImportResult }>('/surveys/import', surveyJson);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useImportXlsx() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ success: boolean; data: ImportResult }>('/surveys/import/xlsx', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useImportGoogleForms() {
  const qc = useQueryClient();
  return useMutation<GoogleFormsImportResult, Error, { url?: string; html?: string }>({
    mutationFn: async (payload) => {
      const { data } = await api.post<{ success: boolean; data: GoogleFormsImportResult }>(
        '/surveys/import/google-forms',
        payload,
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useImportCsv() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ success: boolean; data: ImportResult }>(
        '/surveys/import/csv',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useImportPdf() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ success: boolean; data: ImportResult }>(
        '/surveys/import/pdf',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useImportGoogleSheets() {
  const qc = useQueryClient();
  return useMutation<ImportResult, Error, { url: string; gid?: string }>({
    mutationFn: async (payload) => {
      const { data } = await api.post<{ success: boolean; data: ImportResult }>(
        '/surveys/import/google-sheets',
        payload,
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useImportSurveyCake() {
  const qc = useQueryClient();
  return useMutation<
    ImportResult,
    Error,
    { json?: Record<string, unknown>; url?: string }
  >({
    mutationFn: async (payload) => {
      const { data } = await api.post<{ success: boolean; data: ImportResult }>(
        '/surveys/import/surveycake',
        payload,
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useDownloadXlsxTemplate() {
  return useMutation<Blob, Error, void>({
    mutationFn: async () => {
      const { data } = await api.get('/surveys/template/xlsx', { responseType: 'blob' });
      return data;
    },
  });
}
