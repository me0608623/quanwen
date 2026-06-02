import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../db';
import type { AppDb } from '../db';
import { dailyUsage, users } from '../db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export type AI_FEATURE_TYPE = 'optimize_survey' | 'generate_questions' | 'analyze_responses';

@Injectable()
export class AiUsageService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  private readonly TIER_LIMITS = {
    free: { optimize_survey: 3, generate_questions: 3, analyze_responses: 3 },
    vip: { optimize_survey: 50, generate_questions: 50, analyze_responses: 50 },
    vvip: { optimize_survey: Infinity, generate_questions: Infinity, analyze_responses: Infinity },
  };

  private getUsageCount(
    usage: {
      optimizeSurveyCount: number;
      generateQuestionsCount: number;
      analyzeResponsesCount: number;
    },
    featureType: AI_FEATURE_TYPE,
  ) {
    switch (featureType) {
      case 'optimize_survey':
        return usage.optimizeSurveyCount;
      case 'generate_questions':
        return usage.generateQuestionsCount;
      case 'analyze_responses':
        return usage.analyzeResponsesCount;
    }
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
    const limits = this.TIER_LIMITS[userTier];
    const usage = usageResult[0] || {
      optimizeSurveyCount: 0,
      generateQuestionsCount: 0,
      analyzeResponsesCount: 0,
    };

    return {
      tier: userTier,
      limits: {
        optimizeSurvey: limits.optimize_survey,
        generateQuestions: limits.generate_questions,
        analyzeResponses: limits.analyze_responses,
      },
      used: {
        optimizeSurvey: usage.optimizeSurveyCount,
        generateQuestions: usage.generateQuestionsCount,
        analyzeResponses: usage.analyzeResponsesCount,
      },
      remaining: {
        optimizeSurvey:
          limits.optimize_survey === Infinity
            ? Infinity
            : Math.max(0, limits.optimize_survey - usage.optimizeSurveyCount),
        generateQuestions:
          limits.generate_questions === Infinity
            ? Infinity
            : Math.max(0, limits.generate_questions - usage.generateQuestionsCount),
        analyzeResponses:
          limits.analyze_responses === Infinity
            ? Infinity
            : Math.max(0, limits.analyze_responses - usage.analyzeResponsesCount),
      },
    };
  }

  async checkQuota(userId: string, featureType: AI_FEATURE_TYPE) {
    const usage = await this.getTodayUsage(userId);

    if (usage.tier === 'vvip') {
      return {
        allowed: true,
        tier: usage.tier,
        limit: Infinity,
        used: 0,
        remaining: Infinity,
      };
    }

    const limit = this.TIER_LIMITS[usage.tier][featureType];
    const used = this.getUsageCount(
      {
        optimizeSurveyCount: usage.used.optimizeSurvey,
        generateQuestionsCount: usage.used.generateQuestions,
        analyzeResponsesCount: usage.used.analyzeResponses,
      },
      featureType,
    );

    return {
      allowed: used < limit,
      tier: usage.tier,
      limit,
      used,
      remaining: limit === Infinity ? Infinity : Math.max(0, limit - used),
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
}