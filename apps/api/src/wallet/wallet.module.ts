import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { EcpayService } from './ecpay.service';
import { ReconciliationService } from './reconciliation.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [NotificationsModule, forwardRef(() => KycModule)],
  controllers: [WalletController],
  providers: [WalletService, EcpayService, ReconciliationService],
  exports: [WalletService, ReconciliationService],
})
export class WalletModule {}
