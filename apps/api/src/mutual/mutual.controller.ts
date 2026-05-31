import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { MutualService } from './mutual.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const MutualAnswerSchema = z.object({
  questionId: z.string().uuid(),
  textAnswer: z.string().max(5000).optional(),
  selectedOptionIds: z.array(z.string().uuid()).optional(),
  ratingValue: z.number().int().min(1).max(10).optional(),
});

const SubmitMutualSchema = z.object({
  answers: z.array(MutualAnswerSchema).max(100),
});

type SubmitMutualDto = z.infer<typeof SubmitMutualSchema>;

@Controller('mutual')
@UseGuards(JwtAuthGuard)
export class MutualController {
  constructor(private readonly mutual: MutualService) {}

  /** GET /mutual — 我的所有互惠配對 */
  @Get()
  listMine(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.listMyPairs(user.id);
  }

  /** GET /mutual/pool-stats — 配對池統計 */
  @Get('pool-stats')
  poolStats(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.getPoolStats(user.id);
  }

  /** GET /mutual/my-stats — 我的互惠累計統計 */
  @Get('my-stats')
  myStats(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.getMyStats(user.id);
  }

  /** GET /mutual/:id — 配對詳情 + 要填的對方問卷 */
  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.getPairWithSurvey(id, user.id);
  }

  /** POST /mutual/:id/submit — 提交對方問卷的填答 */
  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(SubmitMutualSchema)) dto: SubmitMutualDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.submitMutualResponse(id, user.id, dto.answers);
  }

  /** POST /mutual/re-enqueue/:surveyId — 把現有 mutual 問卷重新放回 waiting 池 */
  @Post('re-enqueue/:surveyId')
  @HttpCode(HttpStatus.CREATED)
  reEnqueue(@Param('surveyId') surveyId: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.reEnqueueSurvey(user.id, surveyId);
  }

  /** POST /mutual/:id/proof — 外部連結互惠: 上傳完成截圖 */
  @Post(':id/proof')
  @HttpCode(HttpStatus.OK)
  submitProof(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(z.object({ proofUrl: z.string().url().max(2000).refine(u => /^https?:\/\//i.test(u), { message: 'proofUrl 必須使用 http 或 https 協議' }) }))) dto: { proofUrl: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.submitProof(id, user.id, dto.proofUrl);
  }

  /** POST /mutual/:id/rate — 互評對方信譽 (1-5) */
  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  rate(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(z.object({ rating: z.number().int().min(1).max(5) }))) dto: { rating: number },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.mutual.rateOther(id, user.id, dto.rating);
  }
}
