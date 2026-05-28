/**
 * Screen-out 補償政策 — v1.1 scaffold（設計文件:問卷定價與AI獎勵顧問設計.md §11、ADR-009）。
 *
 * 決策層純函式;不接 DB / 不發點數。呼叫端負責:
 *   1) 提供 ScreenOutContext(三個檢查資料)
 *   2) 若 decision.issue=true,執行實際發點(走 wallet transaction type 'points_in')
 *      與防重複的 UNIQUE 紀錄(survey_id + respondent_id)。
 *
 * 為何「scaffold」:篩選題(screening question)功能尚未上;本檔先把政策決策編碼進 code +
 * 測試覆蓋,待 screening feature 整合時直接呼叫此 policy,policy 一旦過了再執行實際入帳。
 */
import { SCREEN_OUT_COMP_POINTS } from '../pricing/pricing.config';

/** 每份問卷的 screen-out 補償總上限(防大量「來踩篩選」洗積分)。 */
export const SCREEN_OUT_PER_SURVEY_CAP =
  Number(process.env.SCREEN_OUT_PER_SURVEY_CAP) || 50;

export interface ScreenOutContext {
  /** 該問卷至今已發放 screen-out 補償的次數。 */
  issuedCountThisSurvey: number;
  /** 該受試者在這份問卷是否已領過 screen-out 補償。 */
  respondentAlreadyClaimed: boolean;
  /** 該受試者是否已完整完成這份問卷(完整完成者走正常 reward,不適用本補償)。 */
  respondentAlreadyCompleted: boolean;
}

export type ScreenOutDecision =
  | { issue: true; amount: number; currency: 'points' }
  | {
      issue: false;
      reason: 'already_completed' | 'already_claimed' | 'per_survey_cap_reached';
    };

/**
 * 決定是否發 screen-out 補償。呼叫端負責提供 ctx + 實際入帳。
 * 補償金額來自 SCREEN_OUT_COMP_POINTS(config,1 點 = NT$1,刻意小)。
 */
export function decideScreenOutCompensation(ctx: ScreenOutContext): ScreenOutDecision {
  if (ctx.respondentAlreadyCompleted) {
    return { issue: false, reason: 'already_completed' };
  }
  if (ctx.respondentAlreadyClaimed) {
    return { issue: false, reason: 'already_claimed' };
  }
  if (ctx.issuedCountThisSurvey >= SCREEN_OUT_PER_SURVEY_CAP) {
    return { issue: false, reason: 'per_survey_cap_reached' };
  }
  return { issue: true, amount: SCREEN_OUT_COMP_POINTS, currency: 'points' };
}
