import { Module } from '@nestjs/common';
import { PointShopService } from './point-shop.service';
import { PointShopController } from './point-shop.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PointShopController],
  providers: [PointShopService],
  exports: [PointShopService],
})
export class PointShopModule {}
