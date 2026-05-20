'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  category: 'voucher_711' | 'voucher_familymart' | 'voucher_starbucks' | 'voucher_general' | 'merchandise';
  costPoints: number;
  faceValue: number;
  imageUrl: string | null;
  stockQty: number;
  active: boolean;
  sortOrder: number;
}

export interface MyRedemption {
  id: string;
  itemId: string;
  itemName: string;
  itemCategory: ShopItem['category'];
  costPoints: number;
  faceValue: number;
  pinCode: string | null;  // 解密後
  status: 'issued' | 'used' | 'expired' | 'cancelled';
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

export function useShopItems() {
  return useQuery<ShopItem[]>({
    queryKey: ['shop', 'items'],
    queryFn: async () => {
      const { data } = await api.get<ShopItem[]>('/shop/items');
      return data;
    },
    staleTime: 60_000,
  });
}

export function useMyRedemptions() {
  return useQuery<MyRedemption[]>({
    queryKey: ['shop', 'my-redemptions'],
    queryFn: async () => {
      const { data } = await api.get<MyRedemption[]>('/shop/my-redemptions');
      return data;
    },
    staleTime: 10_000,
  });
}

export function useRedeem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data } = await api.post<{ redemptionId: string; message: string }>(
        `/shop/redeem/${itemId}`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop', 'my-redemptions'] });
      queryClient.invalidateQueries({ queryKey: ['shop', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

export function useMarkRedemptionUsed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (redemptionId: string) => {
      await api.post(`/shop/my-redemptions/${redemptionId}/mark-used`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop', 'my-redemptions'] });
    },
  });
}

export const CATEGORY_LABEL: Record<ShopItem['category'], string> = {
  voucher_711: '7-11',
  voucher_familymart: '全家',
  voucher_starbucks: '星巴克',
  voucher_general: '通用',
  merchandise: '商品',
};

export const CATEGORY_BADGE: Record<ShopItem['category'], string> = {
  voucher_711: 'bg-green-100 text-green-700',
  voucher_familymart: 'bg-blue-100 text-blue-700',
  voucher_starbucks: 'bg-emerald-100 text-emerald-700',
  voucher_general: 'bg-slate-100 text-slate-700',
  merchandise: 'bg-amber-100 text-amber-700',
};
