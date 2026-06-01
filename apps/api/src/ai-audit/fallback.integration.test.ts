/**
 * Phase II.3-bis: 驗證 LLM service 在 ZAI_API_KEY 缺失時，正確走 rule-based fallback
 *
 * 紅線：LLM 失敗 → 系統仍可用。
 * 之前的 fallback unit tests（withdrawal-risk / platform-health）直接呼叫 private fallback。
 * 這個整合測試走完整路徑：service → real ZaiClient (無 key) → 預期 throw ZaiError(http_401)
 *   → service catch → fallback() 被觸發 → 回傳 rule-based 結果
 *
 * 重點：不能 mock ZaiClient — 必須是真的 ZaiError throw，才有驗證價值
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';

// CRITICAL: 確保 ZAI_API_KEY 在 ZaiClient 載入前是空的
delete process.env.ZAI_API_KEY;
process.env.PII_ENCRYPTION_KEY = 'phase-ii3bis-test-pii-key';
process.env.PII_KDF_SALT = 'phase-ii3bis-salt';

import * as schema from '../db/schema';
import { ZaiClient, ZaiError } from './zai.client';
import { PlatformHealthService } from '../admin/platform-health.service';
import { WithdrawalRiskService } from '../admin/withdrawal-risk.service';

describe('LLM service fallback when ZAI_API_KEY missing (integration)', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let zai: ZaiClient;

  beforeAll(async () => {
    // 證明 ZaiClient 真的會 throw（無 key 路徑）
    zai = new ZaiClient();
    await expect(zai.chat([{ role: 'user', content: 'test' }])).rejects.toBeInstanceOf(ZaiError);
  });

  it('1. ZaiClient.chat 無 key → 立即 throw ZaiError(http_401, attempts=0)', async () => {
    try {
      await zai.chat([{ role: 'user', content: 'test' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ZaiError);
      const z = err as ZaiError;
      expect(z.kind).toBe('http_401');
      expect(z.attempts).toBe(0); // 未進入 retry loop
      expect(z.retryable).toBe(false);
    }
  });

  it('2. PlatformHealthService.summarize 無 key → fallback() 被觸發，回傳 rule-based', async () => {
    const svc = new PlatformHealthService(zai);
    const stats = {
      totalUsers: 50,
      totalSurveyors: 10,
      totalRespondents: 40,
      surveyCounts: { pending_review: 0, published: 3, draft: 0, closed: 0, rejected: 0, paused: 0 },
      totalResponses: 30,
      suspiciousResponses: 0,
      platformRevenue: 500,
      platformRevenueThisMonth: 100,
    };

    const r = await svc.summarize(stats);

    // 應拿到 rule-based fallback 的結果，而非 throw
    expect(r.status).toBe('healthy');
    expect(r.generatedAt).toBeTruthy();
    expect(r.headline).toContain('健康');
    expect(r.highlights.some((h) => h.includes('50') || h.includes('累積'))).toBe(true);
  });

  it('3. PlatformHealthService.summarize 無 key 但有可疑填答 → critical fallback', async () => {
    const svc = new PlatformHealthService(zai);
    const r = await svc.summarize({
      totalUsers: 100,
      totalSurveyors: 20,
      totalRespondents: 80,
      surveyCounts: { pending_review: 0, published: 5, draft: 0, closed: 0, rejected: 0, paused: 0 },
      totalResponses: 100,
      suspiciousResponses: 30, // 30% suspicious → critical
      platformRevenue: 1000,
      platformRevenueThisMonth: 200,
    });

    expect(r.status).toBe('critical');
    expect(r.headline).toContain('可疑');
  });

  it('4. WithdrawalRiskService.assessRisk 無 key → fallback() 被觸發', async () => {
    client = new PGlite();
    await client.exec(`
      CREATE TYPE user_role     AS ENUM ('surveyor','respondent','admin');
      CREATE TYPE user_status   AS ENUM ('active','suspended','pending_verify');
      CREATE TABLE users (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email        VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        role         user_role NOT NULL,
        status       user_status NOT NULL DEFAULT 'active',
        display_name VARCHAR(100) NOT NULL,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TYPE transaction_type AS ENUM (
        'deposit','reward_out','reward_in','platform_fee',
        'withdraw_request','withdraw_complete','refund',
        'points_in','points_spend'
      );
      CREATE TYPE transaction_status AS ENUM (
        'pending','processing','success','failed','cancelled'
      );
      CREATE TABLE transactions (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type                transaction_type NOT NULL,
        amount              INTEGER NOT NULL CHECK (amount > 0),
        status              transaction_status NOT NULL DEFAULT 'pending',
        external_provider   VARCHAR(50),
        external_ref        VARCHAR(200),
        related_survey_id   UUID,
        related_response_id UUID,
        note                TEXT,
        metadata            JSONB,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at        TIMESTAMPTZ,
        UNIQUE (external_provider, external_ref)
      );
      CREATE TYPE survey_status AS ENUM ('draft','pending_review','published','paused','closed','rejected');
      CREATE TYPE reward_type AS ENUM ('cash','points');
      CREATE TABLE surveys (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        surveyor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       VARCHAR(200) NOT NULL,
        status      survey_status NOT NULL DEFAULT 'draft',
        reward_points INTEGER NOT NULL DEFAULT 0,
        deadline_tier       VARCHAR(16) NOT NULL DEFAULT 'standard',
        base_reward_points  INTEGER     NOT NULL DEFAULT 0,
        reward_type  reward_type NOT NULL DEFAULT 'cash',
        target_count INTEGER NOT NULL DEFAULT 100,
        completed_count INTEGER NOT NULL DEFAULT 0,
        is_anonymous BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TYPE response_status AS ENUM ('in_progress','submitted','rewarded','rejected');
      CREATE TYPE response_sentiment AS ENUM ('positive','neutral','negative');
      CREATE TABLE survey_responses (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        survey_id             UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        respondent_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status                response_status NOT NULL DEFAULT 'in_progress',
        sentiment           response_sentiment,
        started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitted_at          TIMESTAMPTZ,
        fill_duration_seconds INTEGER,
        anti_cheat_score      INTEGER,
        suspicious_flags      JSONB,
        quality_score         INTEGER,
        quality_breakdown     JSONB,
        behavior_log          JSONB,
        UNIQUE (survey_id, respondent_id)
      );
    `);

    const USER_ID = '11111111-1111-1111-1111-111111111111';
    const TX_ID = '22222222-2222-2222-2222-222222222222';
    await client.exec(`
      INSERT INTO users (id, email, role, display_name, email_verified, created_at) VALUES
        ('${USER_ID}', 'risky@test.test', 'respondent', '高風險用戶', false, NOW() - INTERVAL '1 day');
      INSERT INTO transactions (id, user_id, type, amount, status, metadata) VALUES
        ('${TX_ID}', '${USER_ID}', 'withdraw_request', 5000, 'pending',
          '{"bankCode":"700","bankAccount":"1234","accountName":"測試"}'::jsonb);
    `);
    db = drizzle(client, { schema });

    const svc = new WithdrawalRiskService(db as never, zai);
    const r = await svc.assessRisk(TX_ID);

    // 應拿到 rule-based fallback：用戶帳齡 1 天 + 大額 5000 + email 未驗證 + 無歷史獎勵 → high
    expect(r.riskLevel).toBe('high');
    expect(r.recommendation).toBe('reject');
    expect(r.redFlags.length).toBeGreaterThan(0);
    expect(r.reasoning).toContain('AI 服務暫時不可用');
  });

  afterAll(async () => {
    await client?.close();
  });
});
