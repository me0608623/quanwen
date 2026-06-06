import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ImportAppealsService } from './import-appeals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

// ─── 使用者：提交匯入失敗申訴 ─────────────────────────────────────────────
@Controller('surveys/import-appeals')
@UseGuards(JwtAuthGuard)
export class ImportAppealsController {
  constructor(private readonly service: ImportAppealsService) {}

  @Post()
  submit(@Body() body: { surveyUrl: string; title?: string; note?: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.service.submit(user.id, body);
  }

  @Get('mine')
  listMine(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.service.listMine(user.id);
  }
}

// ─── 管理員：處理匯入失敗申訴 ─────────────────────────────────────────────
@Controller('admin/import-appeals')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminImportAppealsController {
  constructor(private readonly service: ImportAppealsService) {}

  @Get()
  list(@Req() req: Request) {
    const status = (req.query.status as string) || undefined;
    return this.service.listForAdmin(status);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() body: { createDraft?: boolean; adminNote?: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.service.resolve(id, user.id, body ?? {});
  }

  @Post(':id/dismiss')
  dismiss(@Param('id') id: string, @Body() body: { adminNote: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.service.dismiss(id, user.id, body?.adminNote ?? '');
  }
}
