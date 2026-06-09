import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WalletService } from './wallet.service';
import { CouponsService } from './coupons.service';
import { DepositDto, DepositSchema } from './dto/deposit.dto';
import { WithdrawDto, WithdrawSchema } from './dto/withdraw.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Throttle } from '@nestjs/throttler';

/**
 * Phase S: ECPay webhook 接收端 — 必須無 JWT（ECPay server 直接 POST）。
 * 用 CheckMacValue HMAC 簽章驗證來源。
 */
@Controller('wallet/ecpay')
export class EcpayWebhookController {
  constructor(private readonly wallet: WalletService) {}

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async callback(@Body() body: Record<string, string>, @Res() res: Response) {
    const result = await this.wallet.processEcpayCallback(body);
    res.setHeader('Content-Type', 'text/plain');
    res.send(result);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly coupons: CouponsService,
  ) {}

  // GET /wallet — 我的錢包餘額
  @Get()
  async getMyWallet(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.wallet.getWallet(user.id);
  }

  // GET /wallet/coupons — 優惠券夾(企業品牌問卷獲得的優惠券)
  @Get('coupons')
  async getMyCoupons(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.coupons.listForUser(user.id);
  }

  // GET /wallet/balance - respondent balance API (Phase 1)
  @Get('balance')
  async getBalance(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const wallet = await this.wallet.getWallet(user.id);
    return {
      cashBalance: wallet?.cashBalance ?? 0,
      pointsBalance: wallet?.pointsBalance ?? 0,
      lockedCash: wallet?.lockedCash ?? 0,
    };
  }

  // GET /wallet/earnings-summary — 受試者收益摘要
  @Get('earnings-summary')
  async getEarningsSummary(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.wallet.getEarningsSummary(user.id);
  }

  // GET /wallet/transactions?limit=50 — 交易紀錄
  @Get('transactions')
  async getTransactions(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.wallet.getTransactions(user.id, limit ? parseInt(limit, 10) : 50);
  }

  // POST /wallet/deposit — Mock 儲值（開發專用；prod 必擋）
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Post('deposit')
  async mockDeposit(
    @Req() req: Request,
    @Body(new ZodValidationPipe(DepositSchema)) dto: DepositDto,
  ) {
    // Phase H A01 fix: prod 環境完全禁用，避免帳戶餘額被任意膨脹
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Mock 儲值端點僅供開發環境使用');
    }
    const user = req.user as AuthenticatedUser;
    await this.wallet.mockDeposit(user.id, dto.amount);
    return { message: `已儲值 NT$${dto.amount}（Mock）` };
  }

  // ─── ECPay 儲值 ───────────────────────────────────────────────────────────

  // POST /wallet/ecpay/order — 建立 ECPay 訂單，回傳自動提交 HTML 表單
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Post('ecpay/order')
  @HttpCode(HttpStatus.OK)
  async createEcpayOrder(
    @Req() req: Request,
    @Body(new ZodValidationPipe(DepositSchema)) dto: DepositDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const html = await this.wallet.createEcpayOrder(user.id, dto.amount);
    return { html };
  }

  // POST /wallet/ecpay/callback — ECPay 非同步通知（無 JWT，ECPay Server 呼叫）
  // 註：ECPay callback 移到 EcpayWebhookController（無 JWT，因 ECPay server 直接 POST）

  // GET /wallet/points — 積分摘要
  @Get('points')
  async getPointsSummary(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.wallet.getPointsSummary(user.id);
  }

  // GET /wallet/points/transactions — 積分交易紀錄
  @Get('points/transactions')
  async getPointsTransactions(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.wallet.getPointsTransactions(user.id, limit ? parseInt(limit, 10) : 50);
  }

  // POST /wallet/withdraw — 申請提領
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  @Post('withdraw')
  async requestWithdrawal(
    @Req() req: Request,
    @Body(new ZodValidationPipe(WithdrawSchema)) dto: WithdrawDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const result = await this.wallet.requestWithdrawal(user.id, dto.amount, {
      bankCode: dto.bankCode,
      bankAccount: dto.bankAccount,
      accountName: dto.accountName,
    });
    return {
      message: `提領申請已送出，NT$${dto.amount} 待審核撥款（1-3 個工作日）`,
      transactionId: result.transactionId,
    };
  }
}
