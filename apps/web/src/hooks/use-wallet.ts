'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Wallet {
  id: string;
  userId: string;
  cashBalance: number;
  lockedCash: number;
  pointsBalance: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  status: string;
  note: string | null;
  relatedSurveyId: string | null;
  relatedResponseId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export function useWallet() {
  return useQuery<Wallet>({
    queryKey: ['wallet'],
    queryFn: async () => {
      const { data } = await api.get('/wallet');
      return data;
    },
    staleTime: 15_000,
  });
}

export function useWalletTransactions(limit = 50) {
  return useQuery<WalletTransaction[]>({
    queryKey: ['wallet', 'transactions', limit],
    queryFn: async () => {
      const { data } = await api.get('/wallet/transactions', { params: { limit } });
      return data;
    },
    staleTime: 15_000,
  });
}

export function useMockDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => {
      const { data } = await api.post('/wallet/deposit', { amount });
      return data as { message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

/** ECPay real deposit: get the auto-submit HTML form and inject it into DOM */
export function useEcpayDeposit() {
  return useMutation({
    mutationFn: async (amount: number) => {
      const { data } = await api.post<{ html: string }>('/wallet/ecpay/order', { amount });
      return data.html;
    },
    onSuccess: (html) => {
      // Parse the server-generated ECPay form and submit it.
      // innerHTML does not execute <script> tags, so we extract the form
      // element directly and call .submit() ourselves.
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const form = doc.getElementById('ecpay') as HTMLFormElement | null;
      if (!form) return;
      form.style.display = 'none';
      document.body.appendChild(form);
      form.submit();
    },
  });
}

export interface EarningsSummary {
  totalEarned: number;
  pendingRewards: number;
  thisMonth: number;
  bySurvey: { surveyId: string; surveyTitle: string; amount: number }[];
  monthly: { month: string; amount: number }[];
}

export function useEarningsSummary() {
  return useQuery<EarningsSummary>({
    queryKey: ['wallet', 'earnings-summary'],
    queryFn: async () => {
      const { data } = await api.get('/wallet/earnings-summary');
      return data;
    },
    staleTime: 30_000,
  });
}

export interface PointsSummary {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  thisMonth: number;
  estimatedValue: number; // NT$ 估算價值（balance × 0.5）
}

export function usePointsSummary() {
  return useQuery<PointsSummary>({
    queryKey: ['wallet', 'points-summary'],
    queryFn: async () => {
      const { data } = await api.get('/wallet/points');
      return data;
    },
    staleTime: 15_000,
  });
}

export function usePointsTransactions(limit = 50) {
  return useQuery<WalletTransaction[]>({
    queryKey: ['wallet', 'points-transactions', limit],
    queryFn: async () => {
      const { data } = await api.get('/wallet/points/transactions', { params: { limit } });
      return data;
    },
    staleTime: 15_000,
  });
}

export function useRequestWithdrawal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      amount: number;
      bankCode: string;
      bankAccount: string;
      accountName: string;
    }) => {
      const { data } = await api.post('/wallet/withdraw', params);
      return data as { message: string; transactionId: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
