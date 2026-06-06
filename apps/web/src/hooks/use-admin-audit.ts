'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminTransactionType =
  | 'deposit'
  | 'reward_out'
  | 'reward_in'
  | 'platform_fee'
  | 'withdraw_request'
  | 'withdraw_complete'
  | 'refund'
  | 'points_in'
  | 'points_spend';

export type AdminTransactionStatus = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';

export interface AdminTransactionsParams {
  type?: AdminTransactionType;
  status?: AdminTransactionStatus;
  userId?: string;
  page?: number;
  limit?: number;
}

export interface AdminTransaction {
  id: string;
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
  type: AdminTransactionType | string;
  amount: number;
  status: AdminTransactionStatus | string;
  note: string | null;
  externalProvider: string | null;
  externalRef: string | null;
  relatedSurveyId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AdminTransactionSummary {
  type: AdminTransactionType | string;
  count: number;
  totalAmount: number;
}

export interface AdminTransactionsResponse {
  items: AdminTransaction[];
  total: number;
  page: number;
  limit: number;
  summaryByType: AdminTransactionSummary[];
}

export interface AiUsageResponse {
  days: number;
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    errors: number;
    cacheHits: number;
    estCostUsd: number;
    estCostTwd: number;
  };
  byModel: Array<{
    model: string;
    calls: number;
    totalTokens: number;
    estCostUsd: number;
  }>;
  byPromptKey: Array<{
    promptKey: string;
    calls: number;
    totalTokens: number;
    avgLatencyMs: number;
    errorRate: number;
  }>;
  daily: Array<{
    date: string;
    calls: number;
    totalTokens: number;
    estCostUsd: number;
  }>;
}

export interface ReconciliationReport {
  generatedAt: string;
  invariants: Array<{
    label: string;
    pass: boolean;
    expected: number;
    actual: number;
    note?: string;
  }>;
  totals: {
    escrowEcpay: number;
    walletSum: number;
    platformFeeRevenue: number;
    rewardPayableOutstanding: number;
  };
  unbalancedTransactions: Array<{
    id: string;
    debit: number;
    credit: number;
  }>;
}

export function useAdminTransactions(params: AdminTransactionsParams) {
  return useQuery<AdminTransactionsResponse>({
    queryKey: ['admin', 'transactions', params],
    queryFn: async () => {
      const { data } = await api.get<AdminTransactionsResponse>('/admin/transactions', { params });
      return data;
    },
    staleTime: 15_000,
  });
}

export function useAiUsage(days: number) {
  return useQuery<AiUsageResponse>({
    queryKey: ['admin', 'ai-usage', days],
    queryFn: async () => {
      const { data } = await api.get<AiUsageResponse>('/admin/ai-usage', { params: { days } });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useReconciliation(enabled = false) {
  return useQuery<ReconciliationReport>({
    queryKey: ['admin', 'reconciliation'],
    queryFn: async () => {
      const { data } = await api.get<ReconciliationReport>('/admin/reconciliation');
      return data;
    },
    enabled,
    staleTime: 0,
    retry: 0,
  });
}
