import { Module } from '@nestjs/common';
import { ZaiClient } from './zai.client';
import { AiAuditService } from './ai-audit.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [ZaiClient, AiAuditService],
  exports: [ZaiClient, AiAuditService],
})
export class AiAuditModule {}
