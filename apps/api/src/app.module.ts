import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './db';
import { CommonModule } from './common/common.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
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
    RedisModule, // @Global() — 共用 Redis client（readiness + cron lock）
    ScheduleModule.forRoot(),
    // P2: 限流計數改走 Redis（跨實例共享）。short/medium 限制值不變。
    // storage 在 Redis 不可用時自動 fallback 為 in-memory（逐實例仍會擋，不會無限流）。
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short',  ttl: 1000,   limit: 10  },
        { name: 'medium', ttl: 60_000, limit: 100 },
      ],
      storage: new RedisThrottlerStorage(process.env.REDIS_URL),
    }),
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
