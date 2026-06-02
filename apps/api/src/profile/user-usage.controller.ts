import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AiUsageService } from '../common/ai-usage.service';

@Controller('api/v1/user')
export class UserUsageController {
  constructor(private readonly aiUsageService: AiUsageService) {}

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  async getUsage(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.aiUsageService.getTodayUsage(req.user.id);
  }
}