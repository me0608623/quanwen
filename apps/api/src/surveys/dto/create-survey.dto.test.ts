/**
 * Unit tests for CreateSurveySchema URL protocol enforcement.
 * Regression guard for the javascript: / data: URL bypass via Zod .url().
 */
import { describe, it, expect } from 'vitest';
import { CreateSurveySchema } from './create-survey.dto';

const BASE_SURVEY = {
  title: 'Test Survey',
  type: 'standard' as const,
  isAnonymous: true,
  rewardPoints: 0,
  targetCount: 10,
  aiReviewEnabled: false,
  // 外部問卷需預估分鐘數；BASE 帶上以便 externalUrl 格式測試聚焦在 URL 驗證
  estimatedMinutes: 10,
  questions: [],
};

describe('CreateSurveySchema — URL protocol enforcement', () => {
  it('rejects javascript: externalUrl', () => {
    const r = CreateSurveySchema.safeParse({ ...BASE_SURVEY, externalUrl: 'javascript:alert(document.cookie)' });
    expect(r.success).toBe(false);
  });

  it('rejects data: externalUrl', () => {
    const r = CreateSurveySchema.safeParse({ ...BASE_SURVEY, externalUrl: 'data:text/html,<script>alert(1)</script>' });
    expect(r.success).toBe(false);
  });

  it('rejects ftp: externalUrl', () => {
    const r = CreateSurveySchema.safeParse({ ...BASE_SURVEY, externalUrl: 'ftp://malicious.example.com/file' });
    expect(r.success).toBe(false);
  });

  it('accepts https: externalUrl', () => {
    const r = CreateSurveySchema.safeParse({ ...BASE_SURVEY, externalUrl: 'https://docs.google.com/forms/d/e/test/viewform' });
    expect(r.success).toBe(true);
  });

  it('accepts http: externalUrl', () => {
    const r = CreateSurveySchema.safeParse({ ...BASE_SURVEY, externalUrl: 'http://example.com/survey' });
    expect(r.success).toBe(true);
  });

  it('accepts missing externalUrl (optional field)', () => {
    const r = CreateSurveySchema.safeParse(BASE_SURVEY);
    expect(r.success).toBe(true);
  });

  it('rejects lottery surveys until creator accepts fulfillment terms', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      rewardMode: 'lottery',
      lotteryPrize: '餐券',
      lotteryWinnerCount: 1,
      lotteryDrawMode: 'when_full',
    });
    expect(r.success).toBe(false);
  });

  it('accepts lottery surveys after creator accepts fulfillment terms', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      rewardMode: 'lottery',
      lotteryPrize: '餐券',
      lotteryWinnerCount: 1,
      lotteryDrawMode: 'when_full',
      lotteryTermsAccepted: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a scheduled lottery draw time in the past', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      rewardMode: 'lottery',
      lotteryPrize: '餐券',
      lotteryWinnerCount: 1,
      lotteryDrawMode: 'scheduled',
      lotteryDrawAt: new Date(Date.now() - 60_000).toISOString(),
      lotteryTermsAccepted: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('CreateSurveySchema — question nullish + schedule/reward round-trip', () => {
  it('accepts question description/imageUrl as null (read API round-trip)', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      questions: [
        { type: 'text', title: 'Q1', description: null, imageUrl: null, sortOrder: 0, isRequired: true },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('accepts deadlineTier + schedule fields', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      rewardPoints: 35,
      deadlineTier: 'express',
      scheduledPublishAt: '2026-07-15T01:30:00.000Z',
      autoCloseAt: '2026-08-01T00:00:00.000Z',
      autoCloseAfterN: 300,
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid deadlineTier', () => {
    const r = CreateSurveySchema.safeParse({ ...BASE_SURVEY, deadlineTier: 'turbo' });
    expect(r.success).toBe(false);
  });

  it('rejects rating scales outside the supported range', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      questions: [
        { type: 'rating', title: 'Q1', config: { maxRating: 11, scaleStart: -1 } },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('SurveyQuestionSchema — option count limit', () => {
  // 回歸:Google Forms 匯入台灣 22 縣市單選題曾被 max(20) 擋下(400)
  const makeOptions = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `選項${i + 1}`, sortOrder: i }));

  it('accepts 22 options (台灣縣市)', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      questions: [
        { type: 'single_choice', title: '縣市', sortOrder: 0, isRequired: true, options: makeOptions(22) },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('accepts up to 50 options', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      questions: [
        { type: 'single_choice', title: '長清單', sortOrder: 0, isRequired: true, options: makeOptions(50) },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects 51 options', () => {
    const r = CreateSurveySchema.safeParse({
      ...BASE_SURVEY,
      questions: [
        { type: 'single_choice', title: '太多', sortOrder: 0, isRequired: true, options: makeOptions(51) },
      ],
    });
    expect(r.success).toBe(false);
  });
});
