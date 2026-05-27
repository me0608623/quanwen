import { Injectable } from '@nestjs/common';
import { estimateRubricBase, type QuestionEstimate } from './rubric';
import { SUGGESTION_RANGE } from './pricing.config';
import type { PricingAdviceDto } from './pricing-advice.dto';

export interface PricingAdvice {
  /** 決定性題型查表的建議基準價（整數新台幣元）。 */
  rubricBaseReward: number;
  totalSeconds: number;
  perQuestion: QuestionEstimate[];
  suggestedRange: { economical: number; fair: number; fast: number };
  warnings: string[];
  /** 給前端顯示的提醒：這只是參考。 */
  note: string;
}

/**
 * 問卷定價顧問（MVP）。
 * Layer 1 決定性查表 + 靜態啟發式建議區間；Layer 2 AI 動態調節留待 v1.1。
 * 不揭露任何 AI 模型/廠商名（對外文案鐵律）。
 */
@Injectable()
export class PricingService {
  advise(dto: PricingAdviceDto): PricingAdvice {
    const rubric = estimateRubricBase(dto.questions, { introChars: dto.introChars });
    const fair = rubric.baseRewardNt;

    const suggestedRange = {
      economical: Math.max(0, Math.round(fair * SUGGESTION_RANGE.economical)),
      fair,
      fast: Math.round(fair * SUGGESTION_RANGE.fast),
    };

    const warnings: string[] = [];
    if (dto.proposedRewardNt != null && fair > 0 && dto.proposedRewardNt < fair) {
      warnings.push('低於建議公平價，預期完成率偏低、成案可能較慢。');
    }

    return {
      rubricBaseReward: fair,
      totalSeconds: rubric.totalSeconds,
      perQuestion: rubric.perQuestion,
      suggestedRange,
      warnings,
      note: '此為依題型估算的「參考」建議，實際單份獎勵由你自訂。',
    };
  }
}
