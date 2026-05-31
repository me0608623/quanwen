import {
  Controller, Get, Post, Body, Param, Req,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const SubmitKycSchema = z.object({
  idNumber: z.string().regex(/^[A-Z][12]\d{8}$/, '身分證號格式錯誤'),
  realName: z.string().min(2).max(50),
  phone: z.string().regex(/^09\d{2}\d{6}$/, '手機格式錯誤（09xxxxxxxx）'),
  idFrontUrl: z.string().url().refine(u => /^https?:\/\//i.test(u), { message: 'URL 必須使用 https' }).optional(),
  idBackUrl: z.string().url().refine(u => /^https?:\/\//i.test(u), { message: 'URL 必須使用 https' }).optional(),
  selfieUrl: z.string().url().refine(u => /^https?:\/\//i.test(u), { message: 'URL 必須使用 https' }).optional(),
});
type SubmitKycDto = z.infer<typeof SubmitKycSchema>;

const ApproveSchema = z.object({ adminNote: z.string().max(500).optional() });
type ApproveDto = z.infer<typeof ApproveSchema>;

const RejectSchema = z.object({ adminNote: z.string().min(5).max(500) });
type RejectDto = z.infer<typeof RejectSchema>;

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  /** GET /kyc/me — 自己的 KYC 狀態 */
  @Get('me')
  getMyStatus(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.kyc.getStatus(user.id, /* includeDecrypted */ true);
  }

  /** POST /kyc/submit — 提交 KYC */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @Req() req: Request,
    @Body(new ZodValidationPipe(SubmitKycSchema)) dto: SubmitKycDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.kyc.submit(user.id, dto);
  }
}

@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  /** GET /admin/kyc — 列出待審 KYC */
  @Get()
  list() {
    return this.kyc.listPending();
  }

  /** POST /admin/kyc/:id/approve */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(ApproveSchema)) dto: ApproveDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.kyc.approve(id, user.id, dto.adminNote);
  }

  /** POST /admin/kyc/:id/reject */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(RejectSchema)) dto: RejectDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.kyc.reject(id, user.id, dto.adminNote);
  }
}
