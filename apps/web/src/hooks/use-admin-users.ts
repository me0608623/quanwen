'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminUserStatus = 'active' | 'suspended' | 'pending_verify';

export interface AdminUsersParams {
  q?: string;
  status?: AdminUserStatus;
  page?: number;
  limit?: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  tier: string;
  status: AdminUserStatus | string;
  emailVerified: boolean;
  createdAt: string;
  cashBalance: number;
  pointsBalance: number;
  surveyCount: number;
  responseCount: number;
}

export interface AdminUsersResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    tier: string;
    status: AdminUserStatus | string;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
  oauthProviders: string[];
  wallet: {
    cashBalance: number;
    lockedCash: number;
    pointsBalance: number;
  } | null;
  reputationScore: number | null;
  stats: {
    surveyCount: number;
    responseCount: number;
    approvedResponseCount: number;
    appealCount: number;
  };
  recentTransactions: AdminUserRecentTransaction[];
  recentResponses: AdminUserRecentResponse[];
}

export interface AdminUserRecentTransaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface AdminUserRecentResponse {
  id: string;
  surveyId: string;
  surveyTitle: string;
  status: string;
  qualityScore: number | null;
  submittedAt: string;
}

export interface MultiAccountScan {
  userId: string;
  riskScore: number;
  signals: Array<{
    kind: string;
    detail: string;
    weight: number;
  }>;
  relatedUsers?: Array<{
    id?: string;
    email?: string;
    displayName?: string | null;
    riskScore?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery<AdminUsersResponse>({
    queryKey: ['admin', 'users', params],
    queryFn: async () => {
      const { data } = await api.get<AdminUsersResponse>('/admin/users', { params });
      return data;
    },
    staleTime: 15_000,
  });
}

export function useAdminUserDetail(id: string) {
  return useQuery<AdminUserDetail>({
    queryKey: ['admin', 'users', id],
    queryFn: async () => {
      const { data } = await api.get<AdminUserDetail>(`/admin/users/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useSuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data } = await api.post<{ id: string; status: 'suspended' }>(`/admin/users/${id}/suspend`, { reason });
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useUnsuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ id: string; status: 'active' }>(`/admin/users/${id}/unsuspend`);
      return data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export function useMultiAccountScan(id: string, enabled = false) {
  return useQuery<MultiAccountScan>({
    queryKey: ['admin', 'users', id, 'multi-account-scan'],
    queryFn: async () => {
      const { data } = await api.get<MultiAccountScan>(`/admin/users/${id}/multi-account-scan`);
      return data;
    },
    enabled: enabled && !!id,
    staleTime: 60_000,
    retry: 0,
  });
}
