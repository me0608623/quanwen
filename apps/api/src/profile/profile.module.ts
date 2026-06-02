import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserUsageController } from './user-usage.controller';

@Module({
  controllers: [ProfileController, UserUsageController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
