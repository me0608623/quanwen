'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SpinSegment {
  key: string;
  label: string;
  points: number;
  weight: number;
  color: string;
}

export interface SpinStatus {
  /** 目前可用的抽獎次數（完成問卷累積） */
  availableChances: number;
  earnedTotal: number;
  spentTotal: number;
  canSpin: boolean;
  lastSpin: { prizeKey: string; pointsWon: number; spinDate: string } | null;
  segments: SpinSegment[];
}

export interface SpinResult {
  prizeKey: string;
  label: string;
  pointsWon: number;
  /** 轉完後剩餘抽獎次數（後端回傳，前端即時更新用） */
  availableChances: number;
}

export function useSpinStatus() {
  return useQuery<SpinStatus>({
    queryKey: ['spin', 'status'],
    queryFn: async () => {
      const { data } = await api.get<SpinStatus>('/spin/status');
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSpin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SpinResult>('/spin');
      return data;
    },
    onSuccess: (res) => {
      // 用後端回傳的剩餘次數即時 patch，避免轉完到 refetch 之間次數還顯示舊值
      qc.setQueryData<SpinStatus>(['spin', 'status'], (prev) =>
        prev
          ? { ...prev, availableChances: res.availableChances, canSpin: res.availableChances > 0 }
          : prev,
      );
      qc.invalidateQueries({ queryKey: ['spin'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
