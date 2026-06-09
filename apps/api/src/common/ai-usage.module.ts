import { Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { AiPromptDedupeService } from './ai-prompt-dedupe.service';
import { UserUsageController } from '../profile/user-usage.controller';
import { DatabaseModule } from '../db';

@Module({
  imports: [DatabaseModule],
  controllers: [UserUsageController],
  providers: [AiUsageService, AiPromptDedupeService],
  exports: [AiUsageService, AiPromptDedupeService],
})
export class AiUsageModule {}
