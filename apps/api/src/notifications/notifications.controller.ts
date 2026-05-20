import { Controller, Get, Put, Param, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /notifications — 取得自己的通知（最新 50 筆） */
  @Get()
  findAll(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.notificationsService.findByUser(user.id);
  }

  /** GET /notifications/unread-count — 未讀數量 */
  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const count = await this.notificationsService.countUnread(user.id);
    return { count };
  }

  /** PUT /notifications/read-all — 全部標記已讀（必須在 :id 路由之前） */
  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.notificationsService.markAllRead(user.id);
  }

  /** PUT /notifications/:id/read — 標記單筆已讀 */
  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.notificationsService.markRead(id, user.id);
  }
}
