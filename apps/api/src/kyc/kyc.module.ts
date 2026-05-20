import { Module, forwardRef } from '@nestjs/common';
import { KycService } from './kyc.service';
import { KycController, AdminKycController } from './kyc.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [NotificationsModule, forwardRef(() => AdminModule)],
  controllers: [KycController, AdminKycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
