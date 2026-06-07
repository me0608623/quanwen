import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController, EcpayWebhookController } from './wallet.controller';
import { EcpayService } from './ecpay.service';
import { ReconciliationService } from './reconciliation.service';
import { CouponsService } from './coupons.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [NotificationsModule, forwardRef(() => KycModule)],
  controllers: [WalletController, EcpayWebhookController],
  providers: [WalletService, EcpayService, ReconciliationService, CouponsService],
  exports: [WalletService, ReconciliationService, CouponsService],
})
export class WalletModule {}
