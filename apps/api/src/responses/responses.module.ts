import { Module, forwardRef } from '@nestjs/common';
import { ResponsesController, TasksController } from './responses.controller';
import { ResponsesService } from './responses.service';
import { AntiCheatService } from './anti-cheat.service';
import { QualityAuditService } from './quality-audit.service';
import { AppealsService } from './appeals.service';
import { ReputationService } from './reputation.service';
import { RespondentAssistantService } from './respondent-assistant.service';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SurveysModule } from '../surveys/surveys.module';
import { AiAuditModule } from '../ai-audit/ai-audit.module';

@Module({
  imports: [WalletModule, NotificationsModule, forwardRef(() => SurveysModule), AiAuditModule],
  controllers: [ResponsesController, TasksController],
  providers: [
    ResponsesService,
    AntiCheatService,
    QualityAuditService,
    AppealsService,
    ReputationService,
    RespondentAssistantService,
  ],
  exports: [ResponsesService, QualityAuditService, AppealsService, ReputationService],
})
export class ResponsesModule {}
