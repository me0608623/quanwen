import { Controller, Get, Post, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
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

  /** POST /spin — 轉一次（消耗 1 次抽獎機會；完成問卷可累積）*/
  @Post()
  @HttpCode(HttpStatus.OK)
  doSpin(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.spin.spin(user.id);
  }
}
