import { Module } from '@nestjs/common';
import { PointShopService } from './point-shop.service';
import { PointShopController } from './point-shop.controller';
import { VoucherIssuerService } from './voucher-issuer.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PointShopController],
  providers: [PointShopService, VoucherIssuerService],
  exports: [PointShopService],
})
export class PointShopModule {}
