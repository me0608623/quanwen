import {
  Controller, Get, Post, Param, Req,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { PointShopService } from './point-shop.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('shop')
@UseGuards(JwtAuthGuard)
export class PointShopController {
  constructor(private readonly shop: PointShopService) {}

  /** GET /shop/items — 商品 catalog（任何登入用戶可看，主要給 respondent）*/
  @Get('items')
  list() {
    return this.shop.listItems();
  }

  /** GET /shop/my-redemptions — 自己的兌換歷史（含解密 PIN）*/
  @Get('my-redemptions')
  myRedemptions(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.shop.listMyRedemptions(user.id);
  }

  /** POST /shop/redeem/:itemId — 兌換 */
  @Post('redeem/:itemId')
  @HttpCode(HttpStatus.CREATED)
  redeem(@Param('itemId') itemId: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.shop.redeem(user.id, itemId);
  }

  /** POST /shop/my-redemptions/:id/mark-used — demo 用，標記為已使用 */
  @Post('my-redemptions/:id/mark-used')
  @HttpCode(HttpStatus.OK)
  markUsed(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.shop.markAsUsed(user.id, id);
  }
}
