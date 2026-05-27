import { Controller, Get, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { RedisService } from './redis/redis.service';

interface DepCheck {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Phase J / P4：健康檢查。
 *
 * - GET /health        → liveness：無 JWT、無 DB/Redis 依賴，永遠輕量回 200。
 *                        給 process 還活著的判斷（重啟用）。
 * - GET /health/ready  → readiness：檢查 DB(SELECT 1) + Redis(ping)。
 *                        任一 down → 503。給 LB / K8s 判斷「能否收流量」。
 *                        策略為 strict：Redis ping 失敗（含未設定 / ioredis 未裝）→ 503。
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = new Date();

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly redis: RedisService,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV ?? 'development',
    };
  }

  @Get('ready')
  async ready() {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const ok = db.status === 'up' && redis.status === 'up';

    const body = {
      status: ok ? 'ok' : 'error',
      checks: { db, redis },
      timestamp: new Date().toISOString(),
    };

    if (!ok) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  private async checkDb(): Promise<DepCheck> {
    const start = Date.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error)?.message ?? 'unknown' };
    }
  }

  private async checkRedis(): Promise<DepCheck> {
    const start = Date.now();
    try {
      const up = await this.redis.ping();
      return up
        ? { status: 'up', latencyMs: Date.now() - start }
        : { status: 'down', error: this.redis.configured ? 'ping failed' : 'REDIS_URL not configured' };
    } catch (err) {
      return { status: 'down', error: (err as Error)?.message ?? 'unknown' };
    }
  }
}
