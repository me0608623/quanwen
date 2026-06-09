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
import { ImportAppealsModule } from './surveys/import-appeals.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';
import { UploadModule } from './common/upload/upload.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    RedisModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 10 },
        { name: 'medium', ttl: 60_000, limit: 100 },
      ],
      storage: new RedisThrottlerStorage(process.env.REDIS_URL),
      // E2E 環境關閉 rate limit：大量 test 反覆 login 會撞 /auth/login 的 10/60s 上限 → 429。
      // 生產不設 DISABLE_RATE_LIMIT，throttler 照常生效（紅線：rate limiting on all endpoints）。
      skipIf: () => process.env.DISABLE_RATE_LIMIT === 'true',
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
    ImportAppealsModule,
    AnalyticsModule,
    AiModule,
    UploadModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
