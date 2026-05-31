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
});
