'use client';

import { useMutation } from '@tanstack/react-query';
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

/** 取得問卷定價建議（依題型估算的參考價；發問卷者完全自訂）。 */
export function usePricingAdvice() {
  return useMutation<PricingAdvice, unknown, PricingAdviceInput>({
    mutationFn: async (input) => {
      const { data } = await api.post<PricingAdvice>('/surveys/pricing-advice', input);
      return data;
    },
  });
}
