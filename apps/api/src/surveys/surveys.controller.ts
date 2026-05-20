import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SurveysService } from './surveys.service';
import { SurveyorAssistantService } from './surveyor-assistant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateSurveySchema, CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveySchema, UpdateSurveyDto } from './dto/update-survey.dto';
import { AiDraftSchema, AiDraftDto } from './dto/ai-draft.dto';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('surveys')
@UseGuards(JwtAuthGuard)
export class SurveysController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly walletService: WalletService,
    private readonly assistantService: SurveyorAssistantService,
  ) {}

  /** GET /surveys/assistant — surveyor 專屬 AI 助手「下一步建議」*/
  @Get('assistant')
  getAssistant(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.assistantService.recommend(user.id);
  }

  /** GET /surveys/:id/ai-improve — AI 給現有問卷的改進建議 */
  @Get(':id/ai-improve')
  aiImprove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.aiImprove(id, user.id);
  }

  /** GET /surveys/:id/ai-design/anti-cheat — AI 建議插入注意力檢核題（Phase 4）*/
  @Get(':id/ai-design/anti-cheat')
  suggestAntiCheat(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.suggestAttentionChecks(id, user.id);
  }

  /** GET /surveys/:id/ai-design/pre-review — 上架前 AI 預審（Phase 4）*/
  @Get(':id/ai-design/pre-review')
  preReview(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.preReview(id, user.id);
  }

  // ─── POST /surveys ─────────────────────────────────────────────────────────
  @Post()
  create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(CreateSurveySchema)) dto: CreateSurveyDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.create(user.id, dto);
  }

  // ─── GET /surveys ──────────────────────────────────────────────────────────
  @Get()
  findMine(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.findMine(user.id);
  }

  // ─── GET /surveys/:id ──────────────────────────────────────────────────────
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.findOneDetailed(id, user.id);
  }

  // ─── PUT /surveys/:id ──────────────────────────────────────────────────────
  @Put(':id')
  update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(UpdateSurveySchema)) dto: UpdateSurveyDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.update(id, user.id, dto);
  }

  // ─── POST /surveys/:id/publish ─────────────────────────────────────────────
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.publish(id, user.id);
  }

  // ─── DELETE /surveys/:id ───────────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.remove(id, user.id);
  }

  // ─── GET /surveys/:id/budget-check ────────────────────────────────────────
  @Get(':id/budget-check')
  budgetCheck(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.walletService.checkSurveyBudget(user.id, id);
  }

  // ─── POST /surveys/ai-draft ────────────────────────────────────────────────
  @Post('ai-draft')
  @HttpCode(HttpStatus.OK)
  aiDraft(
    @Req() req: Request,
    @Body(new ZodValidationPipe(AiDraftSchema)) dto: AiDraftDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSurveyor(user);
    return this.surveysService.generateAiDraft(dto);
  }

  // ─── Private ───────────────────────────────────────────────────────────────
  private assertSurveyor(user: AuthenticatedUser) {
    if (user.role !== 'surveyor') {
      throw new ForbiddenException('僅問券方可操作問卷');
    }
  }
}
