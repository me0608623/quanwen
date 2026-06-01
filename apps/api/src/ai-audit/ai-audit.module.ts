import { Module } from '@nestjs/common';
import { ZaiClient } from './zai.client';
import { AiAuditService } from './ai-audit.service';
import { ZaiCallLogService } from './zai-call-log.service';
import { LangfuseSink } from './langfuse';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  // Phase II.11: ZaiCallLogService onModuleInit 註冊 telemetry DB sink
  // Phase II.LF (QUA-175): LangfuseSink 註冊 Langfuse observability sink
  providers: [ZaiClient, AiAuditService, ZaiCallLogService, LangfuseSink],
  exports: [ZaiClient, AiAuditService, ZaiCallLogService],
})
export class AiAuditModule {}
