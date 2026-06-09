import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DB } from '../db';
import type { AppDb } from '../db';
import { dailyUsage, users, wallets } from '../db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import type { BatchAnalysisCostPreview } from '../ai/dto/interpret-statistics-batch.dto.js';
import { POINTS_PER_AI_ANALYSIS } from '../ai/dto/interpret-statistics-batch.dto.js';

export type AI_FEATURE_TYPE = 'optimize_survey' | 'generate_questions' | 'analyze_responses';

@Injectable()
export class AiUsageService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  private readonly TIER_LIMITS = {
    free: 3,
    vip: 50,
    vvip: Infinity,
  };

  private getTotalUsed(usage: {
    optimizeSurveyCount: number;
    generateQuestionsCount: number;
    analyzeResponsesCount: number;
  }) {
    return (
      usage.optimizeSurveyCount +
      usage.generateQuestionsCount +
      usage.analyzeResponsesCount
    );
  }

  async getTodayUsage(userId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [userResult, usageResult] = await Promise.all([
      this.db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1),
      this.db
        .select({
          optimizeSurveyCount: dailyUsage.optimizeSurveyCount,
          generateQuestionsCount: dailyUsage.generateQuestionsCount,
          analyzeResponsesCount: dailyUsage.analyzeResponsesCount,
        })
        .from(dailyUsage)
        .where(and(eq(dailyUsage.userId, userId), gte(dailyUsage.usageDate, todayStart)))
        .limit(1),
    ]);

    if (!userResult.length) {
      throw new Error('User not found');
    }

    const userTier = userResult[0].tier as 'free' | 'vip' | 'vvip';
    const limit = this.TIER_LIMITS[userTier];
    const usage = usageResult[0] || {
      optimizeSurveyCount: 0,
      generateQuestionsCount: 0,
      analyzeResponsesCount: 0,
    };
    const totalUsed = this.getTotalUsed(usage);
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - totalUsed);

    return {
      tier: userTier,
      limits: {
        optimizeSurvey: limit,
        generateQuestions: limit,
        analyzeResponses: limit,
      },
      used: {
        optimizeSurvey: usage.optimizeSurveyCount,
        generateQuestions: usage.generateQuestionsCount,
        analyzeResponses: usage.analyzeResponsesCount,
      },
      remaining: {
        optimizeSurvey: remaining,
        generateQuestions: remaining,
        analyzeResponses: remaining,
      },
      totalUsed,
      totalLimit: limit,
    };
  }

  async checkQuota(userId: string, featureType: AI_FEATURE_TYPE) {
    const usage = await this.getTodayUsage(userId);

    if (usage.tier === 'vvip') {
      return {
        allowed: true,
        tier: usage.tier,
        limit: Infinity,
        used: usage.totalUsed,
        remaining: Infinity,
        featureType,
      };
    }

    const limit = this.TIER_LIMITS[usage.tier];
    const used = usage.totalUsed;

    return {
      allowed: used < limit,
      tier: usage.tier,
      limit,
      used,
      remaining: limit === Infinity ? Infinity : Math.max(0, limit - used),
      featureType,
    };
  }

  async incrementUsage(userId: string, featureType: AI_FEATURE_TYPE) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Try to find today's usage record
    const existingUsage = await this.db
      .select()
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), gte(dailyUsage.usageDate, todayStart)))
      .limit(1);

    if (existingUsage.length > 0) {
      // Update existing record
      const updateData: any = { updatedAt: new Date() };
      switch (featureType) {
        case 'optimize_survey':
          updateData.optimizeSurveyCount = sql`${dailyUsage.optimizeSurveyCount} + 1`;
          break;
        case 'generate_questions':
          updateData.generateQuestionsCount = sql`${dailyUsage.generateQuestionsCount} + 1`;
          break;
        case 'analyze_responses':
          updateData.analyzeResponsesCount = sql`${dailyUsage.analyzeResponsesCount} + 1`;
          break;
      }

      await this.db
        .update(dailyUsage)
        .set(updateData)
        .where(eq(dailyUsage.id, existingUsage[0].id));
    } else {
      // Create new record
      const insertData: any = {
        userId,
        usageDate: todayStart,
        optimizeSurveyCount: 0,
        generateQuestionsCount: 0,
        analyzeResponsesCount: 0,
      };

      switch (featureType) {
        case 'optimize_survey':
          insertData.optimizeSurveyCount = 1;
          break;
        case 'generate_questions':
          insertData.generateQuestionsCount = 1;
          break;
        case 'analyze_responses':
          insertData.analyzeResponsesCount = 1;
          break;
      }

      await this.db.insert(dailyUsage).values(insertData);
    }
  }

  async checkBatchCost(userId: string, count: number): Promise<BatchAnalysisCostPreview> {
    const [usage, walletRow] = await Promise.all([
      this.getTodayUsage(userId),
      this.db
        .select({ pointsBalance: wallets.pointsBalance })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1),
    ]);

    const aiRemaining =
      usage.remaining.analyzeResponses === Infinity ? count : usage.remaining.analyzeResponses;
    const aiCovered = Math.min(count, aiRemaining);
    const pointsCovered = count - aiCovered;
    const pointsRequired = pointsCovered * POINTS_PER_AI_ANALYSIS;
    const pointsAvailable = walletRow[0]?.pointsBalance ?? 0;

    return {
      total: count,
      aiCovered,
      pointsCovered,
      pointsRequired,
      pointsAvailable,
      canProceed: pointsAvailable >= pointsRequired,
    };
  }

  async deductBatchCost(userId: string, aiCount: number, pointsCount: number): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    if (aiCount > 0) {
      for (let i = 0; i < aiCount; i++) {
        tasks.push(this.incrementUsage(userId, 'analyze_responses'));
      }
    }

    if (pointsCount > 0) {
      const deductPoints = async () => {
        const rows = await this.db
          .update(wallets)
          .set({ pointsBalance: sql`${wallets.pointsBalance} - ${pointsCount}` })
          .where(and(eq(wallets.userId, userId), gte(wallets.pointsBalance, pointsCount)))
          .returning({ id: wallets.id });

        if (rows.length === 0) {
          throw new BadRequestException('積分不足');
        }
      };
      tasks.push(deductPoints());
    }

    await Promise.all(tasks);
  }
}