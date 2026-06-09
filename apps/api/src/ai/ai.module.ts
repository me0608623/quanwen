import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db';
import { AiUsageService } from '../common/ai-usage.service';
import { AiPromptDedupeService } from '../common/ai-prompt-dedupe.service';
import { AiQuotaGuard } from '../common/guards/ai-quota.guard';
import { UserUsageController } from '../profile/user-usage.controller';
import { AiController } from './ai.controller';
import { SurveysModule } from '../surveys/surveys.module';
import { ResponsesModule } from '../responses/responses.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [DatabaseModule, SurveysModule, ResponsesModule, AnalyticsModule],
  controllers: [UserUsageController, AiController],
  providers: [AiUsageService, AiPromptDedupeService, AiQuotaGuard],
  exports: [AiUsageService, AiPromptDedupeService, AiQuotaGuard],
})
export class AiModule {}
