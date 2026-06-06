import { Controller, Get, Post, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SpinService } from './spin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('spin')
@UseGuards(JwtAuthGuard)
export class SpinController {
  constructor(private readonly spin: SpinService) {}

  /** GET /spin/status — 剩餘抽獎次數 + 最近結果 + 轉盤格子 */
  @Get('status')
  status(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.spin.getStatus(user.id);
  }

  /**
   * POST /spin — 轉一次（消耗 1 次抽獎機會；完成問卷可累積）
   * 縱深防禦：除全域 throttle 外再加專屬上限。正常使用者受前端動畫（約 4.6s）限制，
   * 一秒內不可能連點；收緊到 2/秒、20/分可擋掉腳本暴力打點，又不影響真人操作。
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 1_000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  doSpin(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.spin.spin(user.id);
  }
}
