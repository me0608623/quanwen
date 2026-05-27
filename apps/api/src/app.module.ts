import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './db';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { TagsModule } from './tags/tags.module';
import { ProfileModule } from './profile/profile.module';
import { SurveysModule } from './surveys/surveys.module';
import { ResponsesModule } from './responses/responses.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';
import { KycModule } from './kyc/kyc.module';
import { PointShopModule } from './point-shop/point-shop.module';
import { MutualModule } from './mutual/mutual.module';
import { SpinModule } from './spin/spin.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    DatabaseModule,
    CommonModule, // @Global() — CryptoService available everywhere
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1000,   limit: 10  },
      { name: 'medium', ttl: 60_000, limit: 100 },
    ]),
    AuthModule,
    TagsModule,
    ProfileModule,
    SurveysModule,
    ResponsesModule,
    NotificationsModule,
    AdminModule,
    WalletModule,
    KycModule,
    PointShopModule,
    MutualModule,
    SpinModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
