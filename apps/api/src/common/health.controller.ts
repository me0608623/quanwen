import { Controller, Get } from '@nestjs/common';

/**
 * Phase J 修：給 Docker healthcheck + uptime monitor 用的 lightweight liveness probe。
 * 無 JWT、無 DB 依賴；只回 200 + 簡單資訊。
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = new Date();

  @Get()
  check() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
