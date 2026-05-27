import { Module } from '@nestjs/common';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { AiInsightsService } from './ai-insights.service';
import { SurveyorAssistantService } from './surveyor-assistant.service';
import { PricingService } from './pricing/pricing.service';
import { AiAuditModule } from '../ai-audit/ai-audit.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [AiAuditModule, WalletModule],
  controllers: [SurveysController],
  providers: [SurveysService, AiInsightsService, SurveyorAssistantService, PricingService],
  exports: [SurveysService, AiInsightsService],
})
export class SurveysModule {}
