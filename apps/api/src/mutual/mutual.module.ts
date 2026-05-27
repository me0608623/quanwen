import { Module } from '@nestjs/common';
import { MutualController } from './mutual.controller';
import { MutualService } from './mutual.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResponsesModule } from '../responses/responses.module';
import { SpinModule } from '../spin/spin.module';

@Module({
  // ResponsesModule 同時提供 QualityAuditService + ReputationService
  imports: [NotificationsModule, ResponsesModule, SpinModule],
  controllers: [MutualController],
  providers: [MutualService],
  exports: [MutualService],
})
export class MutualModule {}
