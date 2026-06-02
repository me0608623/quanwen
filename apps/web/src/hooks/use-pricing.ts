'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SurveyQuestion } from './use-surveys';

/** 對應後端 PricingAdvice（apps/api/src/surveys/pricing/pricing.service.ts）。 */
export interface PricingAdvice {
  rubricBaseReward: number;
  totalSeconds: number;
  perQuestion: { type: string; seconds: number }[];
  suggestedRange: { economical: number; fair: number; fast: number };
  warnings: string[];
  note: string;
}

export interface PricingAdviceInput {
  questions: Pick<SurveyQuestion, 'type' | 'isRequired' | 'options' | 'config'>[];
  introChars?: number;
}

export type SubscriptionPlan = 'free' | 'vip' | 'vvip';

export interface SubscriptionSnapshot {
  currentPlan: SubscriptionPlan;
  plans: Array<{
    id: SubscriptionPlan;
    name: string;
    priceMonthly: number;
    dailyAiLimit: number | null;
    badge: string;
    cta: string;
  }>;
  usage: {
    todayUsed: number;
    todayLimit: number | null;
    display: string;
  };
  wallet: {
    pointsBalance: number;
  };
  redemption: {
    targetPlan: 'vip';
    costPoints: number;
    durationDays: number;
    affordable: boolean;
  };
}

/** 取得問卷定價建議（依題型估算的參考價；發問卷者完全自訂）。 */
export function usePricingAdvice() {
  return useMutation<PricingAdvice, unknown, PricingAdviceInput>({
    mutationFn: async (input) => {
      const { data } = await api.post<PricingAdvice>('/surveys/pricing-advice', input);
      return data;
    },
  });
}

export function useSubscription() {
  return useQuery<SubscriptionSnapshot>({
    queryKey: ['user', 'subscription'],
    queryFn: async () => {
      const { data } = await api.get<SubscriptionSnapshot>('/user/subscription');
      return data;
    },
    staleTime: 15_000,
  });
}

export function useSubscribePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (plan: Exclude<SubscriptionPlan, 'free'>) => {
      const { data } = await api.post<{ html: string; amount: number; plan: SubscriptionPlan }>(
        '/user/subscribe',
        { plan },
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });

      const doc = new DOMParser().parseFromString(data.html, 'text/html');
      const form = doc.getElementById('ecpay') as HTMLFormElement | null;
      if (!form) return;
      form.style.display = 'none';
      document.body.appendChild(form);
      form.submit();
    },
  });
}

export function useRedeemSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ message: string; plan: SubscriptionPlan }>('/user/redeem', {
        plan: 'vip',
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
