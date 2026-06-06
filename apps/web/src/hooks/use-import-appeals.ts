'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ImportAppeal {
  id: string;
  requesterId: string;
  requesterEmail?: string | null;
  surveyUrl: string;
  title?: string | null;
  note?: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  adminNote?: string | null;
  resolvedSurveyId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

/** 使用者：提交匯入失敗申訴 */
export function useSubmitImportAppeal() {
  return useMutation({
    mutationFn: async (body: { surveyUrl: string; title?: string; note?: string }) => {
      const { data } = await api.post('/surveys/import-appeals', body);
      return data as { message: string };
    },
  });
}

/** 管理員：列出申訴 */
export function useAdminImportAppeals(status: string = 'pending') {
  return useQuery<ImportAppeal[]>({
    queryKey: ['admin', 'import-appeals', status],
    queryFn: async () => {
      const { data } = await api.get<ImportAppeal[]>('/admin/import-appeals', {
        params: status ? { status } : undefined,
      });
      return data;
    },
  });
}

/** 管理員：處理（建立草稿）/ 駁回 */
export function useResolveImportAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, createDraft, adminNote }: { id: string; createDraft?: boolean; adminNote?: string }) => {
      const { data } = await api.post(`/admin/import-appeals/${id}/resolve`, { createDraft, adminNote });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'import-appeals'] }),
  });
}

export function useDismissImportAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote: string }) => {
      const { data } = await api.post(`/admin/import-appeals/${id}/dismiss`, { adminNote });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'import-appeals'] }),
  });
}
