import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AiQuota } from '../common/ai-quota.decorator';
import { AiQuotaGuard } from '../common/guards/ai-quota.guard';
import { AiUsageService } from '../common/ai-usage.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SurveysService } from '../surveys/surveys.service';
import { ResponsesService } from '../responses/responses.service';
import { AiInsightsService } from '../surveys/ai-insights.service';
import {
  AiOptimizeSurveySchema,
  type AiOptimizeSurveyDto,
} from './dto/optimize-survey.dto';
import {
  AiAnalyzeResponsesSchema,
  type AiAnalyzeResponsesDto,
} from './dto/analyze-responses.dto';
import { AiDraftSchema, type AiDraftDto } from '../surveys/dto/ai-draft.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, AiQuotaGuard)
export class AiController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly responsesService: ResponsesService,
    private readonly aiInsightsService: AiInsightsService,
    private readonly aiUsageService: AiUsageService,
  ) {}

  @Post('optimize-survey')
  @HttpCode(HttpStatus.OK)
  @AiQuota('optimize_survey')
  async optimizeSurvey(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiOptimizeSurveySchema)) dto: AiOptimizeSurveyDto,
  ) {
    const result = await this.surveysService.aiImprove(dto.surveyId, req.user.id);
    await this.aiUsageService.incrementUsage(req.user.id, 'optimize_survey');
    return result;
  }

  @Post('generate-questions')
  @HttpCode(HttpStatus.OK)
  @AiQuota('generate_questions')
  async generateQuestions(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiDraftSchema)) dto: AiDraftDto,
  ) {
    const result = await this.surveysService.generateAiDraft(dto);
    await this.aiUsageService.incrementUsage(req.user.id, 'generate_questions');
    return result;
  }

  @Post('analyze-responses')
  @HttpCode(HttpStatus.OK)
  @AiQuota('analyze_responses')
  async analyzeResponses(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiAnalyzeResponsesSchema)) dto: AiAnalyzeResponsesDto,
  ) {
    const stats = await this.responsesService.getSurveyStats(dto.surveyId, req.user.id);
    const result = await this.aiInsightsService.analyze(stats, dto.reportType);
    await this.aiUsageService.incrementUsage(req.user.id, 'analyze_responses');
    return result;
  }
}
