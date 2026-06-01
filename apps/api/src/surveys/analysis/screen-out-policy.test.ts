import { describe, it, expect } from 'vitest';
import { decideScreenOutCompensation, SCREEN_OUT_PER_SURVEY_CAP } from './screen-out-policy';
import { SCREEN_OUT_COMP_POINTS } from '../pricing/pricing.config';

const ctx = (over: Partial<Parameters<typeof decideScreenOutCompensation>[0]> = {}) => ({
  issuedCountThisSurvey: 0,
  respondentAlreadyClaimed: false,
  respondentAlreadyCompleted: false,
  ...over,
});

describe('decideScreenOutCompensation', () => {
  it('一般情況 → 發放 SCREEN_OUT_COMP_POINTS 積分', () => {
    const d = decideScreenOutCompensation(ctx());
    expect(d).toEqual({ issue: true, amount: SCREEN_OUT_COMP_POINTS, currency: 'points' });
  });

  it('已完整完成 → 不發(走正常 reward)', () => {
    expect(decideScreenOutCompensation(ctx({ respondentAlreadyCompleted: true }))).toEqual({
      issue: false,
      reason: 'already_completed',
    });
  });

  it('已領過 → 不發(防重複)', () => {
    expect(decideScreenOutCompensation(ctx({ respondentAlreadyClaimed: true }))).toEqual({
      issue: false,
      reason: 'already_claimed',
    });
  });

  it('已達 per-survey 上限 → 不發(防大量來踩篩選)', () => {
    expect(
      decideScreenOutCompensation(ctx({ issuedCountThisSurvey: SCREEN_OUT_PER_SURVEY_CAP })),
    ).toEqual({ issue: false, reason: 'per_survey_cap_reached' });
  });

  it('優先序:completed > claimed > cap', () => {
    // 三個守門同時擋:回傳第一個命中的(completed)
    const d = decideScreenOutCompensation({
      issuedCountThisSurvey: SCREEN_OUT_PER_SURVEY_CAP,
      respondentAlreadyClaimed: true,
      respondentAlreadyCompleted: true,
    });
    expect(d).toEqual({ issue: false, reason: 'already_completed' });
  });
});
