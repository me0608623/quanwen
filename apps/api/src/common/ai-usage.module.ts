import { Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { UserUsageController } from '../profile/user-usage.controller';

@Module({
  controllers: [UserUsageController],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}