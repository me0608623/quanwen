import { Module } from '@nestjs/common';
import { ZaiClient } from './zai.client';
import { AiAuditService } from './ai-audit.service';
import { ZaiCallLogService } from './zai-call-log.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  // Phase II.11: ZaiCallLogService onModuleInit 註冊 telemetry DB sink
  providers: [ZaiClient, AiAuditService, ZaiCallLogService],
  exports: [ZaiClient, AiAuditService, ZaiCallLogService],
})
export class AiAuditModule {}
