import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import * as schema from '../db/schema';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { AiUsageService } from './ai-usage.service';

describe('AiUsageService (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: AiUsageService;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new AiUsageService(db);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await db.delete(schema.dailyUsage);
    await db.delete(schema.users);
  });

  async function createUser(tier: 'free' | 'vip' | 'vvip' = 'free') {
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${randomUUID()}@example.com`,
        displayName: 'Quota Test User',
        role: 'surveyor',
        tier,
      })
      .returning();

    return user;
  }

  it('free tier should start with 3 uses per day across all AI features', async () => {
    const user = await createUser('free');

    const usage = await service.getTodayUsage(user.id);

    expect(usage.tier).toBe('free');
    expect(usage.used.optimizeSurvey).toBe(0);
    expect(usage.used.generateQuestions).toBe(0);
    expect(usage.used.analyzeResponses).toBe(0);
    expect(usage.totalUsed).toBe(0);
    expect(usage.totalLimit).toBe(3);
    expect(usage.remaining.optimizeSurvey).toBe(3);
    expect(usage.remaining.generateQuestions).toBe(3);
    expect(usage.remaining.analyzeResponses).toBe(3);
  });

  it('vip tier should expose 50 uses per day across all AI features', async () => {
    const user = await createUser('vip');

    const usage = await service.getTodayUsage(user.id);

    expect(usage.tier).toBe('vip');
    expect(usage.limits.optimizeSurvey).toBe(50);
    expect(usage.limits.generateQuestions).toBe(50);
    expect(usage.limits.analyzeResponses).toBe(50);
    expect(usage.totalLimit).toBe(50);
  });

  it('vvip tier should be unlimited', async () => {
    const user = await createUser('vvip');

    const usage = await service.getTodayUsage(user.id);
    const quota = await service.checkQuota(user.id, 'optimize_survey');

    expect(usage.tier).toBe('vvip');
    expect(usage.remaining.optimizeSurvey).toBe(Infinity);
    expect(quota.allowed).toBe(true);
    expect(quota.remaining).toBe(Infinity);
  });

  it('incrementUsage should create and update the same daily row', async () => {
    const user = await createUser();

    await service.incrementUsage(user.id, 'optimize_survey');
    await service.incrementUsage(user.id, 'generate_questions');
    await service.incrementUsage(user.id, 'generate_questions');
    await service.incrementUsage(user.id, 'analyze_responses');

    const [usageRow] = await db
      .select()
      .from(schema.dailyUsage)
      .where(eq(schema.dailyUsage.userId, user.id))
      .limit(1);

    expect(usageRow.optimizeSurveyCount).toBe(1);
    expect(usageRow.generateQuestionsCount).toBe(2);
    expect(usageRow.analyzeResponsesCount).toBe(1);
  });

  it('checkQuota should deny free users after 3 total calls across all AI features', async () => {
    const user = await createUser('free');

    await service.incrementUsage(user.id, 'optimize_survey');
    await service.incrementUsage(user.id, 'generate_questions');
    await service.incrementUsage(user.id, 'analyze_responses');

    const usage = await service.getTodayUsage(user.id);
    const quota = await service.checkQuota(user.id, 'generate_questions');

    expect(usage.totalUsed).toBe(3);
    expect(usage.remaining.optimizeSurvey).toBe(0);
    expect(usage.remaining.generateQuestions).toBe(0);
    expect(usage.remaining.analyzeResponses).toBe(0);
    expect(quota.allowed).toBe(false);
    expect(quota.used).toBe(3);
    expect(quota.limit).toBe(3);
    expect(quota.remaining).toBe(0);
  });

  it('checkQuota should still allow the third total call but block the fourth', async () => {
    const user = await createUser('free');

    await service.incrementUsage(user.id, 'optimize_survey');
    await service.incrementUsage(user.id, 'generate_questions');

    const thirdCallQuota = await service.checkQuota(user.id, 'analyze_responses');
    expect(thirdCallQuota.allowed).toBe(true);
    expect(thirdCallQuota.remaining).toBe(1);

    await service.incrementUsage(user.id, 'analyze_responses');

    const fourthCallQuota = await service.checkQuota(user.id, 'optimize_survey');
    expect(fourthCallQuota.allowed).toBe(false);
    expect(fourthCallQuota.used).toBe(3);
    expect(fourthCallQuota.remaining).toBe(0);
  });

  it('daily_usage should enforce the user foreign key', async () => {
    await expect(
      db.insert(schema.dailyUsage).values({
        userId: randomUUID(),
        usageDate: new Date(),
        optimizeSurveyCount: 1,
        generateQuestionsCount: 0,
        analyzeResponsesCount: 0,
      }),
    ).rejects.toBeDefined();
  });

  describe('token budget', () => {
    it('getTodayTokensUsed returns 0 for a new user', async () => {
      const user = await createUser('free');
      expect(await service.getTodayTokensUsed(user.id)).toBe(0);
    });

    it('incrementTokenUsage creates a row on first call and increments on subsequent calls', async () => {
      const user = await createUser('free');
      await service.incrementTokenUsage(user.id, 1000);
      expect(await service.getTodayTokensUsed(user.id)).toBe(1000);

      await service.incrementTokenUsage(user.id, 500);
      expect(await service.getTodayTokensUsed(user.id)).toBe(1500);
    });

    it('checkTokenBudget allows a free user under the 50k limit', async () => {
      const user = await createUser('free');
      const result = await service.checkTokenBudget(user.id, 3000);
      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(0);
      expect(result.limit).toBe(50_000);
    });

    it('checkTokenBudget blocks a free user when estimated tokens would exceed the limit', async () => {
      const user = await createUser('free');
      await service.incrementTokenUsage(user.id, 48_000);

      const result = await service.checkTokenBudget(user.id, 3000); // 48k + 3k = 51k > 50k
      expect(result.allowed).toBe(false);
      expect(result.tokensUsed).toBe(48_000);
    });

    it('checkTokenBudget allows a vvip user regardless of token count', async () => {
      const user = await createUser('vvip');
      await service.incrementTokenUsage(user.id, 1_000_000);

      const result = await service.checkTokenBudget(user.id, 999_999);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1); // -1 means unlimited
    });

    it('checkTokenBudget returns a resetAt date in the future', async () => {
      const user = await createUser('free');
      const result = await service.checkTokenBudget(user.id, 100);
      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('AiUsageService.estimateTokens', () => {
    it('estimates tokens from a JSON string with overhead', () => {
      const body = JSON.stringify({ topic: 'test', count: 5 });
      const tokens = AiUsageService.estimateTokens(body);
      // overhead is 2000; body is ~24 chars → ~8 tokens → total ~2008
      expect(tokens).toBeGreaterThan(2000);
    });

    it('returns at least FIXED_TOKEN_OVERHEAD for empty body', () => {
      const tokens = AiUsageService.estimateTokens('{}');
      expect(tokens).toBeGreaterThanOrEqual(2000);
    });
  });
});
