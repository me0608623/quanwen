import { Module } from '@nestjs/common';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { AiInsightsService } from './ai-insights.service';
import { SurveyorAssistantService } from './surveyor-assistant.service';
import { PricingService } from './pricing/pricing.service';
import { SurveySchedulerService } from './survey-scheduler.service';
import { SurveyLotteryService } from './survey-lottery.service';
// Phase 1: 模板匯入/匯出
import { SurveyExportService } from './template-io/survey-export.service';
import { SurveyImportService } from './template-io/survey-import.service';
import { ExcelTemplateService } from './template-io/excel-template.service';
import { ExcelImportService } from './template-io/excel-import.service';
// Phase 2: Google Forms HTML 匯入
import { GoogleFormsImportService } from './template-io/google-forms.service';
// Phase 2.1: CSV 匯入
import { CsvImportService } from './template-io/csv-import.service';
// Phase 2.3: Google Sheets 公開連結匯入
import { GoogleSheetsImportService } from './template-io/google-sheets-import.service';
// Phase 3: PDF 匯入
import { PdfImportService } from './template-io/pdf-import.service';
// Phase 3: SurveyCake 匯入
import { SurveyCakeImportService } from './template-io/surveycake-import.service';
import { AiAuditModule } from '../ai-audit/ai-audit.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AiAuditModule, WalletModule, NotificationsModule],
  controllers: [SurveysController],
  providers: [
    SurveysService,
    AiInsightsService,
    SurveyorAssistantService,
    PricingService,
    SurveySchedulerService,
    SurveyLotteryService,
    SurveyExportService,
    SurveyImportService,
    ExcelTemplateService,
    ExcelImportService,
    GoogleFormsImportService,
    CsvImportService,
    GoogleSheetsImportService,
    PdfImportService,
    SurveyCakeImportService,
  ],
  exports: [SurveysService, AiInsightsService, SurveyLotteryService],
})
export class SurveysModule {}
