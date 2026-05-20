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
import { DepositDto, DepositSchema } from './dto/deposit.dto';
import { WithdrawDto, WithdrawSchema } from './dto/withdraw.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  // GET /wallet — 我的錢包餘額
  @Get()
  async getMyWallet(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.wallet.getWallet(user.id);
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
  @Post('ecpay/callback')
  @HttpCode(HttpStatus.OK)
  async ecpayCallback(
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ) {
    const result = await this.wallet.processEcpayCallback(body);
    // ECPay expects plain text response: '1|OK'
    res.setHeader('Content-Type', 'text/plain');
    res.send(result);
  }

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
