import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AdminAuditService } from './admin-audit.service';

const EXTRA_DDL = `
  CREATE TYPE transaction_type AS ENUM (
    'deposit','reward_out','reward_in','platform_fee',
    'withdraw_request','withdraw_complete','refund','points_in','points_spend'
  );
  CREATE TYPE transaction_status AS ENUM ('pending','processing','success','failed','cancelled');
  CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                transaction_type NOT NULL,
    amount              INTEGER NOT NULL,
    status              transaction_status NOT NULL DEFAULT 'pending',
    external_provider   VARCHAR(50),
    external_ref        VARCHAR(200),
    related_survey_id   UUID REFERENCES surveys(id),
    related_response_id UUID REFERENCES survey_responses(id),
    note                TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
  );
  CREATE TABLE zai_call_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model             VARCHAR(64) NOT NULL,
    prompt_key        VARCHAR(100),
    prompt_version    VARCHAR(32),
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens      INTEGER NOT NULL DEFAULT 0,
    latency_ms        INTEGER NOT NULL DEFAULT 0,
    attempts          INTEGER NOT NULL DEFAULT 1,
    finish_reason     VARCHAR(32) NOT NULL,
    error_kind        VARCHAR(32),
    cache_hit         BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

describe('AdminAuditService (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: AdminAuditService;
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    await client.exec(EXTRA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AdminAuditService(db);

    const [u1] = await db.insert(schema.users).values({
      email: 'payer@example.com', role: 'surveyor', displayName: 'Payer',
    }).returning();
    const [u2] = await db.insert(schema.users).values({
      email: 'earner@example.com', role: 'respondent', displayName: 'Earner',
    }).returning();
    userId = u1.id;
    otherId = u2.id;

    await db.insert(schema.transactions).values([
      { userId, type: 'deposit', amount: 1000, status: 'success' },
      { userId, type: 'reward_out', amount: 115, status: 'success', note: '發獎' },
      { userId: otherId, type: 'reward_in', amount: 100, status: 'success' },
      { userId: otherId, type: 'withdraw_request', amount: 300, status: 'pending' },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('listTransactions', () => {
    it('lists all with user info and summary by type', async () => {
      const result = await service.listTransactions({ page: 1, limit: 50 });
      expect(result.total).toBe(4);
      expect(result.items[0].userEmail).toBeTruthy();
      const depositSummary = result.summaryByType.find((s) => s.type === 'deposit');
      expect(depositSummary).toMatchObject({ count: 1, totalAmount: 1000 });
    });

    it('filters by type', async () => {
      const result = await service.listTransactions({ type: 'reward_out', page: 1, limit: 50 });
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({ type: 'reward_out', amount: 115, note: '發獎' });
      expect(result.summaryByType).toHaveLength(1);
    });

    it('filters by status and userId', async () => {
      const result = await service.listTransactions({
        status: 'pending', userId: otherId, page: 1, limit: 50,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].type).toBe('withdraw_request');
    });

    it('paginates', async () => {
      const result = await service.listTransactions({ page: 2, limit: 3 });
      expect(result.total).toBe(4);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getAiUsage', () => {
    beforeEach(async () => {
      await db.insert(schema.zaiCallLog).values([
        // glm-5.1: 1M prompt + 1M completion → $1.4 + $4.4 = $5.8
        {
          model: 'glm-5.1', promptKey: 'survey.audit', promptTokens: 500_000,
          completionTokens: 500_000, totalTokens: 1_000_000, latencyMs: 1200, finishReason: 'stop',
        },
        {
          model: 'glm-5.1', promptKey: 'survey.audit', promptTokens: 500_000,
          completionTokens: 500_000, totalTokens: 1_000_000, latencyMs: 800,
          finishReason: 'error', errorKind: 'timeout',
        },
        // flash 免費 → 不影響成本
        {
          model: 'glm-4.5-flash', promptKey: 'mutual.gate', promptTokens: 100_000,
          completionTokens: 100_000, totalTokens: 200_000, latencyMs: 300,
          finishReason: 'stop', cacheHit: true,
        },
      ]);
    });

    it('aggregates totals with cost estimation', async () => {
      const result = await service.getAiUsage(30);
      expect(result.totals.calls).toBe(3);
      expect(result.totals.totalTokens).toBe(2_200_000);
      expect(result.totals.errors).toBe(1);
      expect(result.totals.cacheHits).toBe(1);
      // glm-5.1: 1M×$1.4 + 1M×$4.4 = $5.8; flash = $0
      expect(result.totals.estCostUsd).toBeCloseTo(5.8, 2);
      expect(result.totals.estCostTwd).toBe(Math.round(5.8 * 32.5));
    });

    it('groups by model with per-model cost', async () => {
      const result = await service.getAiUsage(30);
      const glm = result.byModel.find((m) => m.model === 'glm-5.1');
      const flash = result.byModel.find((m) => m.model === 'glm-4.5-flash');
      expect(glm).toMatchObject({ calls: 2, totalTokens: 2_000_000 });
      expect(glm!.estCostUsd).toBeCloseTo(5.8, 2);
      expect(flash!.estCostUsd).toBe(0);
    });

    it('computes per-promptKey error rate and latency', async () => {
      const result = await service.getAiUsage(30);
      const audit = result.byPromptKey.find((k) => k.promptKey === 'survey.audit');
      expect(audit).toMatchObject({ calls: 2, errorRate: 0.5 });
      expect(audit!.avgLatencyMs).toBe(1000);
    });

    it('produces daily series', async () => {
      const result = await service.getAiUsage(30);
      expect(result.daily).toHaveLength(1);
      expect(result.daily[0].calls).toBe(3);
      expect(result.daily[0].estCostUsd).toBeCloseTo(5.8, 2);
    });
  });
});
