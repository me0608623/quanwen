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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spin'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
