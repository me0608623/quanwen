import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { userCoupons } from '../db/schema';

/**
 * 用戶優惠券夾(user_coupons)。
 *
 * 企業品牌問卷(surveys.is_brand_survey)通過品質審核後發放優惠券,
 * 存放於 /wallet 優惠券夾。同一份填答只發一張(response_id 唯一,冪等)。
 */
@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(@Inject(DB) private readonly db: AppDb) {}

  async issueForResponse(input: {
    userId: string;
    surveyId: string;
    responseId: string;
    brandName: string | null;
    title: string;
    code: string | null;
    expiresAt: Date | null;
  }): Promise<void> {
    await this.db
      .insert(userCoupons)
      .values({
        userId: input.userId,
        surveyId: input.surveyId,
        responseId: input.responseId,
        brandName: input.brandName,
        title: input.title,
        code: input.code,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing({ target: userCoupons.responseId });
    this.logger.log(
      `優惠券發放 user=${input.userId.slice(0, 8)} survey=${input.surveyId.slice(0, 8)} title=${input.title}`,
    );
  }

  async listForUser(userId: string) {
    return this.db
      .select({
        id: userCoupons.id,
        surveyId: userCoupons.surveyId,
        brandName: userCoupons.brandName,
        title: userCoupons.title,
        code: userCoupons.code,
        status: userCoupons.status,
        expiresAt: userCoupons.expiresAt,
        acquiredAt: userCoupons.acquiredAt,
      })
      .from(userCoupons)
      .where(eq(userCoupons.userId, userId))
      .orderBy(desc(userCoupons.acquiredAt));
  }
}
