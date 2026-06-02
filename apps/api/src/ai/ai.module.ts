import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db';
import { AiUsageService } from '../common/ai-usage.service';
import { AiQuotaMiddleware } from '../common/middleware/ai-quota.middleware';
import { UserUsageController } from '../profile/user-usage.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [UserUsageController],
  providers: [AiUsageService, AiQuotaMiddleware],
  exports: [AiUsageService, AiQuotaMiddleware],
})
export class AiModule {}