import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, NextFunction } from 'express';
import { AiUsageService, type AI_FEATURE_TYPE } from '../ai-usage.service';

export interface UsageRequest extends Request {
  userId?: string;
  userTier?: 'free' | 'vip' | 'vvip';
}

@Injectable()
export class AiQuotaMiddleware implements NestMiddleware {
  constructor(private readonly aiUsageService: AiUsageService) {}

  async use(req: UsageRequest, next: NextFunction) {
    const userId = req.userId ?? (req as Request & { user?: { id?: string } }).user?.id;
    const featureType = req.headers['x-ai-feature'] as AI_FEATURE_TYPE;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!featureType) {
      throw new ForbiddenException('AI feature type not specified');
    }

    const quota = await this.aiUsageService.checkQuota(userId, featureType);
    req.userTier = quota.tier;

    if (!quota.allowed) {
      throw new ForbiddenException(
        `AI feature limit reached. You have used ${quota.used}/${quota.limit} ${featureType} calls today. Upgrade to VIP or VVIP for more.`,
      );
    }

    next();
  }
}