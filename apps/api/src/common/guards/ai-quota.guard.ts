import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AI_QUOTA_FEATURE_KEY } from '../ai-quota.decorator';
import { AiUsageService, type AI_FEATURE_TYPE } from '../ai-usage.service';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

@Injectable()
export class AiQuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly aiUsageService: AiUsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<AI_FEATURE_TYPE>(AI_QUOTA_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // 1. Check call-count quota (existing)
    const quota = await this.aiUsageService.checkQuota(userId, feature);
    if (!quota.allowed) {
      throw new ForbiddenException({
        message: 'AI feature limit reached',
        feature,
        tier: quota.tier,
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining,
      });
    }

    // 2. Check daily token budget (secondary cost guard)
    const bodyJson = JSON.stringify(req.body ?? {});
    const estimatedTokens = AiUsageService.estimateTokens(bodyJson);
    const tokenCheck = await this.aiUsageService.checkTokenBudget(userId, estimatedTokens);
    if (!tokenCheck.allowed) {
      throw new HttpException(
        {
          message: 'Daily AI token budget exceeded',
          tokensUsed: tokenCheck.tokensUsed,
          limit: tokenCheck.limit,
          resetAt: tokenCheck.resetAt.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
