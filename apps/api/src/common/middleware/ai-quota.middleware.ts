import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users, dailyUsage } from '../db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { userTierEnum } from '../db/schema/users';

export interface UsageRequest extends Request {
  userId?: string;
  userTier?: 'free' | 'vip' | 'vvip';
}

export type AI_FEATURE_TYPE = 'optimize_survey' | 'generate_questions' | 'analyze_responses';

@Injectable()
export class AiQuotaMiddleware implements NestMiddleware {
  private readonly TIER_LIMITS = {
    free: { optimize_survey: 3, generate_questions: 3, analyze_responses: 3 },
    vip: { optimize_survey: 50, generate_questions: 50, analyze_responses: 50 },
    vvip: { optimize_survey: Infinity, generate_questions: Infinity, analyze_responses: Infinity },
  };

  async use(req: UsageRequest, res: Response, next: NextFunction) {
    const userId = req.userId;
    const featureType = req.headers['x-ai-feature'] as AI_FEATURE_TYPE;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!featureType) {
      throw new ForbiddenException('AI feature type not specified');
    }

    // Get user tier
    const userResult = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userResult.length) {
      throw new ForbiddenException('User not found');
    }

    const userTier = userResult[0].tier as 'free' | 'vip' | 'vvip';
    req.userTier = userTier;

    // Check if VVIP (unlimited)
    if (userTier === 'vvip') {
      next();
      return;
    }

    // Get today's usage
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const usageResult = await db
      .select({
        optimizeSurveyCount: dailyUsage.optimizeSurveyCount,
        generateQuestionsCount: dailyUsage.generateQuestionsCount,
        analyzeResponsesCount: dailyUsage.analyzeResponsesCount,
      })
      .from(dailyUsage)
      .where(
        and(
          eq(dailyUsage.userId, userId),
          gte(dailyUsage.usageDate, todayStart),
        ),
      )
      .limit(1);

    let currentUsage = usageResult[0] || {
      optimizeSurveyCount: 0,
      generateQuestionsCount: 0,
      analyzeResponsesCount: 0,
    };

    // Check limit
    const limit = this.TIER_LIMITS[userTier][featureType];
    const used = currentUsage[featureType];

    if (used >= limit) {
      throw new ForbiddenException(
        `AI feature limit reached. You have used ${used}/${limit} ${featureType} calls today. Upgrade to VIP or VVIP for more.`,
      );
    }

    next();
  }
}