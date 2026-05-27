import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisLockService } from './redis-lock.service';

/**
 * P4: 全域共用 Redis 基礎設施。
 * - RedisService：readiness ping + 提供底層 client
 * - RedisLockService：P3 cron 分散式鎖
 *
 * @Global → 任何模組（含 CommonModule 的 HealthController、MutualService）
 * 都能直接注入，毋須各自 import。
 */
@Global()
@Module({
  providers: [RedisService, RedisLockService],
  exports: [RedisService, RedisLockService],
})
export class RedisModule {}
