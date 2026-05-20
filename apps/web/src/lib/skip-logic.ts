/**
 * Phase G.1: 跳題邏輯 runtime evaluator
 *
 * 給定當前題答案 + 題目 config.skipLogic（多條 rule），決定下一題該跳到哪 index。
 * 沒有 rule 觸發 → 自然進下一題（index + 1）
 * skipToEnd → 直接結束（回傳 sentinel -1）
 */

import type { SkipLogicRule } from '@/hooks/use-surveys';

export interface SkipDecision {
  nextIndex: number;  // -1 = end of survey
  triggered: boolean;
  reason?: string;
}

export function evaluateSkipLogic(
  currentIndex: number,
  questionConfig: Record<string, unknown> | undefined,
  answer: {
    selectedOptionIds?: string[];
    ratingValue?: number;
  },
): SkipDecision {
  const rules = questionConfig?.skipLogic as SkipLogicRule[] | undefined;
  if (!Array.isArray(rules) || rules.length === 0) {
    return { nextIndex: currentIndex + 1, triggered: false };
  }

  for (const rule of rules) {
    let matched = false;
    if (rule.selectedOptionId && answer.selectedOptionIds?.includes(rule.selectedOptionId)) {
      matched = true;
    } else if (typeof rule.selectedRating === 'number' && answer.ratingValue === rule.selectedRating) {
      matched = true;
    }

    if (matched) {
      if (rule.skipToEnd) {
        return { nextIndex: -1, triggered: true, reason: 'skip_to_end' };
      }
      if (typeof rule.skipToQuestionIndex === 'number') {
        return {
          nextIndex: rule.skipToQuestionIndex,
          triggered: true,
          reason: `skip_to_q${rule.skipToQuestionIndex + 1}`,
        };
      }
    }
  }

  return { nextIndex: currentIndex + 1, triggered: false };
}

/** 把 SkipLogicRule[] 編輯成 UI 友善的描述文字 */
export function describeSkipLogic(rules: SkipLogicRule[] | undefined, optionLabels: Map<string, string>): string {
  if (!rules || rules.length === 0) return '';
  return rules
    .map((r) => {
      const trigger = r.selectedOptionId
        ? `選「${optionLabels.get(r.selectedOptionId) ?? r.selectedOptionId}」`
        : r.selectedRating
          ? `評 ${r.selectedRating} 分`
          : '?';
      const dest = r.skipToEnd
        ? '結束問卷'
        : r.skipToQuestionIndex != null
          ? `跳到 Q${r.skipToQuestionIndex + 1}`
          : '?';
      return `若 ${trigger} → ${dest}`;
    })
    .join('；');
}
