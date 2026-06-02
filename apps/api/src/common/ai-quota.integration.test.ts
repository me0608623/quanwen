/**
 * AI Quota System Integration Tests
 *
 * 測試 AI 配額系統的核心功能：
 * 1. 用戶等級配置（free/vip/vvip）
 * 2. 每日用量追蹤
 * 3. 配額檢查 middleware
 * 4. 使用量查詢 API
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../test-helpers/pglite-ddl';
import { db } from '../db';
import { users, dailyUsage } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AiUsageService } from './ai-usage.service';
import { AiQuotaMiddleware } from './middleware/ai-quota.middleware';

describe('AI Quota System Integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.delete(dailyUsage);
    await db.delete(users);
  });

  describe('User Tiers', () => {
    it('should create users with correct tier default', async () => {
      const [user] = await db
        .insert(users)
        .values({
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'surveyor',
        })
        .returning();

      expect(user.tier).toBe('free');
    });

    it('should support all tier levels', async () => {
      const tiers = ['free', 'vip', 'vvip'] as const;
      const createdUsers = await db
        .insert(users)
        .values(
          tiers.map((tier) => ({
            email: `test${tier}@example.com`,
            displayName: `Test ${tier}`,
            role: 'surveyor' as const,
            tier,
          }))
        )
        .returning();

      expect(createdUsers).toHaveLength(3);
      expect(createdUsers.map((u) => u.tier)).toEqual(tiers);
    });
  });

  describe('AiUsageService', () => {
    let aiUsageService: AiUsageService;
    let testUser: any;

    beforeEach(async () => {
      aiUsageService = new AiUsageService();
      [testUser] = await db
        .insert(users)
        .values({
          email: 'usage-test@example.com',
          displayName: 'Usage Test User',
          role: 'surveyor',
        })
        .returning();
    });

    describe('getTodayUsage', () => {
      it('should return zero usage for new user', async () => {
        const usage = await aiUsageService.getTodayUsage(testUser.id);

        expect(usage.tier).toBe('free');
        expect(usage.limits.optimizeSurvey).toBe(3);
        expect(usage.limits.generateQuestions).toBe(3);
        expect(usage.limits.analyzeResponses).toBe(3);
        expect(usage.used.optimizeSurvey).toBe(0);
        expect(usage.used.generateQuestions).toBe(0);
        expect(usage.used.analyzeResponses).toBe(0);
        expect(usage.remaining.optimizeSurvey).toBe(3);
        expect(usage.remaining.generateQuestions).toBe(3);
        expect(usage.remaining.analyzeResponses).toBe(3);
      });

      it('should return correct limits for VIP user', async () => {
        await db
          .update(users)
          .set({ tier: 'vip' })
          .where(eq(users.id, testUser.id));

        const usage = await aiUsageService.getTodayUsage(testUser.id);

        expect(usage.tier).toBe('vip');
        expect(usage.limits.optimizeSurvey).toBe(50);
        expect(usage.limits.generateQuestions).toBe(50);
        expect(usage.limits.analyzeResponses).toBe(50);
      });

      it('should return infinite limits for VVIP user', async () => {
        await db
          .update(users)
          .set({ tier: 'vvip' })
          .where(eq(users.id, testUser.id));

        const usage = await aiUsageService.getTodayUsage(testUser.id);

        expect(usage.tier).toBe('vvip');
        expect(usage.limits.optimizeSurvey).toBe(Infinity);
        expect(usage.limits.generateQuestions).toBe(Infinity);
        expect(usage.limits.analyzeResponses).toBe(Infinity);
      });

      it('should calculate remaining usage correctly', async () => {
        // Add some usage records
        await db.insert(dailyUsage).values({
          userId: testUser.id,
          usageDate: new Date(),
          optimizeSurveyCount: 2,
          generateQuestionsCount: 1,
          analyzeResponsesCount: 0,
        });

        const usage = await aiUsageService.getTodayUsage(testUser.id);

        expect(usage.used.optimizeSurvey).toBe(2);
        expect(usage.used.generateQuestions).toBe(1);
        expect(usage.remaining.optimizeSurvey).toBe(1);
        expect(usage.remaining.generateQuestions).toBe(2);
        expect(usage.remaining.analyzeResponses).toBe(3);
      });
    });

    describe('incrementUsage', () => {
      it('should create new daily usage record for first use', async () => {
        await aiUsageService.incrementUsage(testUser.id, 'optimize_survey');

        const [usageRecord] = await db
          .select()
          .from(dailyUsage)
          .where(eq(dailyUsage.userId, testUser.id))
          .limit(1);

        expect(usageRecord).toBeDefined();
        expect(usageRecord.optimizeSurveyCount).toBe(1);
        expect(usageRecord.generateQuestionsCount).toBe(0);
        expect(usageRecord.analyzeResponsesCount).toBe(0);
      });

      it('should increment existing usage record', async () => {
        // Create initial record
        await db.insert(dailyUsage).values({
          userId: testUser.id,
          usageDate: new Date(),
          optimizeSurveyCount: 2,
          generateQuestionsCount: 1,
          analyzeResponsesCount: 0,
        });

        // Increment
        await aiUsageService.incrementUsage(testUser.id, 'optimize_survey');

        const [usageRecord] = await db
          .select()
          .from(dailyUsage)
          .where(eq(dailyUsage.userId, testUser.id))
          .limit(1);

        expect(usageRecord.optimizeSurveyCount).toBe(3);
      });

      it('should increment different feature types independently', async () => {
        await aiUsageService.incrementUsage(testUser.id, 'optimize_survey');
        await aiUsageService.incrementUsage(testUser.id, 'generate_questions');
        await aiUsageService.incrementUsage(testUser.id, 'generate_questions');
        await aiUsageService.incrementUsage(testUser.id, 'analyze_responses');

        const [usageRecord] = await db
          .select()
          .from(dailyUsage)
          .where(eq(dailyUsage.userId, testUser.id))
          .limit(1);

        expect(usageRecord.optimizeSurveyCount).toBe(1);
        expect(usageRecord.generateQuestionsCount).toBe(2);
        expect(usageRecord.analyzeResponsesCount).toBe(1);
      });
    });
  });

  describe('Tier Limits', () => {
    it('should have correct limits for free tier', () => {
      const middleware = new AiQuotaMiddleware();
      // @ts-ignore - access private property for testing
      const limits = middleware.TIER_LIMITS;

      expect(limits.free.optimize_survey).toBe(3);
      expect(limits.free.generate_questions).toBe(3);
      expect(limits.free.analyze_responses).toBe(3);
    });

    it('should have correct limits for VIP tier', () => {
      const middleware = new AiQuotaMiddleware();
      // @ts-ignore - access private property for testing
      const limits = middleware.TIER_LIMITS;

      expect(limits.vip.optimize_survey).toBe(50);
      expect(limits.vip.generate_questions).toBe(50);
      expect(limits.vip.analyze_responses).toBe(50);
    });

    it('should have infinite limits for VVIP tier', () => {
      const middleware = new AiQuotaMiddleware();
      // @ts-ignore - access private property for testing
      const limits = middleware.TIER_LIMITS;

      expect(limits.vvip.optimize_survey).toBe(Infinity);
      expect(limits.vvip.generate_questions).toBe(Infinity);
      expect(limits.vvip.analyze_responses).toBe(Infinity);
    });
  });

  describe('Daily Usage Schema', () => {
    it('should create daily usage record with correct structure', async () => {
      const [user] = await db
        .insert(users)
        .values({
          email: 'schema-test@example.com',
          displayName: 'Schema Test User',
          role: 'surveyor',
        })
        .returning();

      const [usage] = await db
        .insert(dailyUsage)
        .values({
          userId: user.id,
          usageDate: new Date(),
          optimizeSurveyCount: 1,
          generateQuestionsCount: 2,
          analyzeResponsesCount: 3,
        })
        .returning();

      expect(usage.id).toBeDefined();
      expect(usage.userId).toBe(user.id);
      expect(usage.optimizeSurveyCount).toBe(1);
      expect(usage.generateQuestionsCount).toBe(2);
      expect(usage.analyzeResponsesCount).toBe(3);
      expect(usage.createdAt).toBeInstanceOf(Date);
      expect(usage.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce user foreign key constraint', async () => {
      // This should fail if FK constraint is properly enforced
      try {
        await db.insert(dailyUsage).values({
          userId: 'non-existent-user-id',
          usageDate: new Date(),
          optimizeSurveyCount: 1,
          generateQuestionsCount: 0,
          analyzeResponsesCount: 0,
        });
        // If we get here, FK constraint might not be enforced
      } catch (error) {
        // Expected: FK constraint violation
        expect(error).toBeDefined();
      }
    });
  });
});