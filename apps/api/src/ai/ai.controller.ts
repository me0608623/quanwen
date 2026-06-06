import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { AiReportStoreService } from '../surveys/ai-report-store.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  AiInterpretStatisticsSchema,
  type AiInterpretStatisticsDto,
} from './dto/interpret-statistics.dto';
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
    private readonly aiReportStore: AiReportStoreService,
    private readonly analyticsService: AnalyticsService,
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
    // 持久化:切換報告類型 / 重新整理 / 服務重啟後仍可讀,不再耗額度
    const generatedAt = new Date();
    await this.aiReportStore.save(dto.surveyId, dto.reportType, result);
    return { ...result, generatedAt: generatedAt.toISOString() };
  }

  /**
   * 進階統計 AI 解讀（差異性分析 / 迴歸）。
   * 後端重算統計（同時驗證問卷擁有權），再交給 LLM 產生白話解讀，耗 analyze_responses 額度。
   */
  @Post('interpret-statistics')
  @HttpCode(HttpStatus.OK)
  @AiQuota('analyze_responses')
  async interpretStatistics(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiInterpretStatisticsSchema)) dto: AiInterpretStatisticsDto,
  ) {
    let label: string;
    let result: unknown;
    if (dto.analysisType === 'group_comparison') {
      label = '差異性分析（t 檢定 / 單因子變異數分析）';
      result = await this.analyticsService.getGroupComparison(
        dto.surveyId,
        req.user.id,
        dto.ratingQuestionId,
        dto.groupQuestionId,
      );
    } else {
      label = '複迴歸分析';
      result = await this.analyticsService.getRegression(
        dto.surveyId,
        req.user.id,
        dto.dependentId,
        dto.independentIds,
      );
    }
    const interpretation = await this.aiInsightsService.interpretStatistics(
      label,
      '問卷',
      result,
    );
    await this.aiUsageService.incrementUsage(req.user.id, 'analyze_responses');
    return { result, ...interpretation };
  }

  /** 讀取已保存的 AI 分析報告(不耗 AI 額度);未生成過回 {report: null} */
  @Get('analyze-responses/saved')
  async getSavedReport(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query(new ZodValidationPipe(AiAnalyzeResponsesSchema)) query: AiAnalyzeResponsesDto,
  ) {
    const saved = await this.aiReportStore.getSaved(req.user.id, query.surveyId, query.reportType);
    if (!saved) return { report: null };
    return {
      report: saved.payload,
      generatedAt: saved.generatedAt.toISOString(),
    };
  }
}
