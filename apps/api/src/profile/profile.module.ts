import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db';
import { WalletModule } from '../wallet/wallet.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserUsageController } from './user-usage.controller';
import { UserSubscriptionController } from './user-subscription.controller';
import { UserSubscriptionService } from './user-subscription.service';
import { AiUsageService } from '../common/ai-usage.service';

@Module({
  imports: [DatabaseModule, WalletModule],
  controllers: [ProfileController, UserUsageController, UserSubscriptionController],
  providers: [ProfileService, AiUsageService, UserSubscriptionService],
  exports: [ProfileService],
})
export class ProfileModule {}
