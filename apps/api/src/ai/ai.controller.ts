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
   * 進階統計 AI 解讀。
   * 後端先 deterministic 重算指定分析（同時驗證問卷擁有權），再只把結構化數值交給 LLM 白話解讀。
   * 使用者每次呼叫此 AI 解讀都會耗用 analyze_responses 額度／點數。
   */
  @Post('interpret-statistics')
  @HttpCode(HttpStatus.OK)
  @AiQuota('analyze_responses')
  async interpretStatistics(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiInterpretStatisticsSchema)) dto: AiInterpretStatisticsDto,
  ) {
    const prepared = await this.prepareAdvancedAnalysisForAi(dto, req.user.id);
    const interpretation = await this.aiInsightsService.interpretStatistics(
      prepared.label,
      '問卷',
      prepared.result,
    );
    await this.aiUsageService.incrementUsage(req.user.id, 'analyze_responses');
    return {
      analysisType: dto.analysisType,
      chargedFeature: 'analyze_responses' as const,
      result: prepared.result,
      ...interpretation,
    };
  }

  private async prepareAdvancedAnalysisForAi(
    dto: AiInterpretStatisticsDto,
    userId: string,
  ): Promise<{ label: string; result: unknown }> {
    switch (dto.analysisType) {
      case 'cross_tab':
        return {
          label: '交叉分析（交叉表與 Cramér’s V 關聯強度）',
          result: await this.analyticsService.getCrossTab(dto.surveyId, userId, dto.questionA, dto.questionB),
        };
      case 'scale_reliability':
        return {
          label: "信度分析（Cronbach's α）",
          result: await this.analyticsService.getScaleReliability(
            dto.surveyId,
            userId,
            dto.questionIds,
            dto.reverseQuestionIds,
          ),
        };
      case 'nps':
        return {
          label: 'NPS 淨推薦值',
          result: await this.analyticsService.getNps(dto.surveyId, userId, dto.questionId),
        };
      case 'correlation':
        return {
          label: '相關性分析（Pearson r）',
          result: await this.analyticsService.getCorrelation(dto.surveyId, userId, dto.questionA, dto.questionB),
        };
      case 'group_comparison':
        return {
          label: '差異性分析（t 檢定 / 單因子變異數分析）',
          result: await this.analyticsService.getGroupComparison(
            dto.surveyId,
            userId,
            dto.ratingQuestionId,
            dto.groupQuestionId,
          ),
        };
      case 'regression':
        return {
          label: '複迴歸分析',
          result: await this.analyticsService.getRegression(dto.surveyId, userId, dto.dependentId, dto.independentIds),
        };
      case 'segmentation':
        return {
          label: '回答者分群分析（k-means）',
          result: await this.analyticsService.getSegmentation(dto.surveyId, userId, dto.k ?? 3),
        };
    }
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
