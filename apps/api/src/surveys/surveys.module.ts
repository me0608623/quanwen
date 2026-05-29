import { Module } from '@nestjs/common';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { AiInsightsService } from './ai-insights.service';
import { SurveyorAssistantService } from './surveyor-assistant.service';
import { PricingService } from './pricing/pricing.service';
// Phase 1: 模板匯入/匯出
import { SurveyExportService } from './template-io/survey-export.service';
import { SurveyImportService } from './template-io/survey-import.service';
import { ExcelTemplateService } from './template-io/excel-template.service';
import { ExcelImportService } from './template-io/excel-import.service';
import { AiAuditModule } from '../ai-audit/ai-audit.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [AiAuditModule, WalletModule],
  controllers: [SurveysController],
  providers: [
    SurveysService,
    AiInsightsService,
    SurveyorAssistantService,
    PricingService,
    SurveyExportService,
    SurveyImportService,
    ExcelTemplateService,
    ExcelImportService,
  ],
  exports: [SurveysService, AiInsightsService],
})
export class SurveysModule {}
