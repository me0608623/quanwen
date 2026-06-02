import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserSubscriptionService } from './user-subscription.service';

const SubscribeSchema = z.object({
  plan: z.enum(['vip', 'vvip']),
});

const RedeemSchema = z.object({
  plan: z.literal('vip').optional(),
});

type SubscribeDto = z.infer<typeof SubscribeSchema>;
type RedeemDto = z.infer<typeof RedeemSchema>;

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserSubscriptionController {
  constructor(private readonly subscriptions: UserSubscriptionService) {}

  @Get('subscription')
  getSubscription(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.subscriptions.getSubscription(user.id);
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  subscribe(
    @Req() req: Request,
    @Body(new ZodValidationPipe(SubscribeSchema)) dto: SubscribeDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.subscriptions.subscribe(user.id, dto.plan);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  redeem(
    @Req() req: Request,
    @Body(new ZodValidationPipe(RedeemSchema)) _dto: RedeemDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.subscriptions.redeem(user.id);
  }
}