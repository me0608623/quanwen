import {
  Controller, Get, Post, Body, Param, Query, Req,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminUsersService } from './admin-users.service';
import { WalletService } from '../wallet/wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const SuspendUserSchema = z.object({ reason: z.string().trim().min(5).max(500) });
type SuspendUserDto = z.infer<typeof SuspendUserSchema>;

const AdjustWalletSchema = z.object({
  amount: z.number().int().refine((n) => n !== 0, { message: 'amount 不可為 0' }),
  reason: z.string().trim().min(1).max(500),
});
type AdjustWalletDto = z.infer<typeof AdjustWalletSchema>;

const UpdateUserTierSchema = z.object({ tier: z.enum(['free', 'vip', 'vvip']) });
type UpdateUserTierDto = z.infer<typeof UpdateUserTierSchema>;

const SearchUsersQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  status: z.enum(['active', 'suspended', 'pending_verify']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
type SearchUsersQuery = z.infer<typeof SearchUsersQuerySchema>;

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly wallet: WalletService,
  ) {}

  /** GET /admin/users — 使用者搜尋（email / 顯示名稱模糊比對 + 狀態篩選 + 分頁） */
  @Get('users')
  searchUsers(@Query(new ZodValidationPipe(SearchUsersQuerySchema)) query: SearchUsersQuery) {
    return this.adminUsers.searchUsers(query);
  }

  /** GET /admin/users/:id — 使用者詳情（含錢包 / 信譽 / 近期交易與填答） */
  @Get('users/:id')
  getUserDetail(@Param('id') id: string) {
    return this.adminUsers.getUserDetail(id);
  }

  /** POST /admin/users/:id/tier — 調整使用者 VIP 等級並通知使用者 */
  @Post('users/:id/tier')
  @HttpCode(HttpStatus.OK)
  updateUserTier(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(UpdateUserTierSchema)) dto: UpdateUserTierDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.adminUsers.updateUserTier(user.id, id, dto.tier);
  }

  /** POST /admin/users/:id/suspend — 停權（不可停權 admin / 自己；需理由） */
  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  suspendUser(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(SuspendUserSchema)) dto: SuspendUserDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.adminUsers.suspendUser(user.id, id, dto.reason);
  }

  /** POST /admin/users/:id/unsuspend — 復權 */
  @Post('users/:id/unsuspend')
  @HttpCode(HttpStatus.OK)
  unsuspendUser(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.adminUsers.unsuspendUser(user.id, id);
  }

  // ─── 錢包管理 ─────────────────────────────────────────────────────────────

  /** GET /admin/users/:id/wallet — 查看用戶錢包餘額與近期交易 */
  @Get('users/:id/wallet')
  getUserWallet(@Param('id') id: string) {
    return this.wallet.getAdminWalletDetail(id);
  }

  /** POST /admin/users/:id/wallet/adjust — 手動調整現金餘額（正=增加，負=扣除） */
  @Post('users/:id/wallet/adjust')
  @HttpCode(HttpStatus.OK)
  adjustUserWallet(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(AdjustWalletSchema)) dto: AdjustWalletDto,
  ) {
    const admin = req.user as AuthenticatedUser;
    return this.wallet.adminAdjustBalance({
      userId: id,
      adminId: admin.id,
      amount: dto.amount,
      reason: dto.reason,
    });
  }
}
