import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AiQuota } from '../common/ai-quota.decorator';
import { AiQuotaGuard } from '../common/guards/ai-quota.guard';
import { AiUsageService } from '../common/ai-usage.service';
import { AiPromptDedupeService } from '../common/ai-prompt-dedupe.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SurveysService } from '../surveys/surveys.service';
import { ResponsesService } from '../responses/responses.service';
import { AiInsightsService } from '../surveys/ai-insights.service';
import { AiReportStoreService } from '../surveys/ai-report-store.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  AiInterpretStatisticsSchema,
  type AiInterpretStatisticsDto,
} from './dto/interpret-statistics.dto.js';
import {
  AiOptimizeSurveySchema,
  type AiOptimizeSurveyDto,
} from './dto/optimize-survey.dto';
import {
  AiAnalyzeResponsesSchema,
  type AiAnalyzeResponsesDto,
} from './dto/analyze-responses.dto';
import { AiDraftSchema, type AiDraftDto } from '../surveys/dto/ai-draft.dto';
import {
  InterpretStatisticsBatchSchema,
  type InterpretStatisticsBatchDto,
} from './dto/interpret-statistics-batch.dto.js';

@Controller('ai')
@UseGuards(JwtAuthGuard, AiQuotaGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly surveysService: SurveysService,
    private readonly responsesService: ResponsesService,
    private readonly aiInsightsService: AiInsightsService,
    private readonly aiUsageService: AiUsageService,
    private readonly aiReportStore: AiReportStoreService,
    private readonly analyticsService: AnalyticsService,
    private readonly dedupe: AiPromptDedupeService,
  ) {}

  @Post('optimize-survey')
  @HttpCode(HttpStatus.OK)
  @AiQuota('optimize_survey')
  async optimizeSurvey(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiOptimizeSurveySchema)) dto: AiOptimizeSurveyDto,
  ) {
    const userId = req.user.id;
    const dedupeKey = this.dedupe.makeKey(userId, dto);
    const cached = this.dedupe.get<unknown>(dedupeKey);
    if (cached !== undefined) return cached;

    const result = await this.surveysService.aiImprove(dto.surveyId, userId);
    await Promise.all([
      this.aiUsageService.incrementUsage(userId, 'optimize_survey'),
      this.aiUsageService.incrementTokenUsage(userId, AiUsageService.estimateTokens(JSON.stringify(dto))),
    ]);
    this.dedupe.set(dedupeKey, result);
    return result;
  }

  @Post('generate-questions')
  @HttpCode(HttpStatus.OK)
  @AiQuota('generate_questions')
  async generateQuestions(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiDraftSchema)) dto: AiDraftDto,
  ) {
    const userId = req.user.id;
    const dedupeKey = this.dedupe.makeKey(userId, dto);
    const cached = this.dedupe.get<unknown>(dedupeKey);
    if (cached !== undefined) return cached;

    const result = await this.surveysService.generateAiDraft(dto);
    await Promise.all([
      this.aiUsageService.incrementUsage(userId, 'generate_questions'),
      this.aiUsageService.incrementTokenUsage(userId, AiUsageService.estimateTokens(JSON.stringify(dto))),
    ]);
    this.dedupe.set(dedupeKey, result);
    return result;
  }

  @Post('analyze-responses')
  @HttpCode(HttpStatus.OK)
  @AiQuota('analyze_responses')
  async analyzeResponses(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(AiAnalyzeResponsesSchema)) dto: AiAnalyzeResponsesDto,
  ) {
    const userId = req.user.id;
    const dedupeKey = this.dedupe.makeKey(userId, dto);
    const cached = this.dedupe.get<unknown>(dedupeKey);
    if (cached !== undefined) return cached;

    const stats = await this.responsesService.getSurveyStats(dto.surveyId, userId);
    const result = await this.aiInsightsService.analyze(stats, dto.reportType);
    // Post-generation side-effects: usage tracking + report persistence.
    // These are value-add steps — a failure must not prevent the caller from
    // receiving the generated insights (use allSettled so one failure doesn't
    // cancel the others, and log each failure for observability).
    const [usageResult, tokenResult, saveResult] = await Promise.allSettled([
      this.aiUsageService.incrementUsage(userId, 'analyze_responses'),
      this.aiUsageService.incrementTokenUsage(userId, AiUsageService.estimateTokens(JSON.stringify(dto))),
      this.aiReportStore.save(dto.surveyId, dto.reportType, result),
    ]);
    if (usageResult.status === 'rejected') {
      this.logger.error('incrementUsage failed (non-fatal)', usageResult.reason);
    }
    if (tokenResult.status === 'rejected') {
      this.logger.error('incrementTokenUsage failed (non-fatal)', tokenResult.reason);
    }
    if (saveResult.status === 'rejected') {
      this.logger.error('aiReportStore.save failed (non-fatal)', saveResult.reason);
    }
    const generatedAt = new Date();
    const response = { ...result, generatedAt: generatedAt.toISOString() };
    this.dedupe.set(dedupeKey, response);
    return response;
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

  /** 批次 AI 統計解讀成本預覽（不耗額度）。前端在送出批次前用此確認費用。 */
  @Get('interpret-statistics/batch/cost-preview')
  @UseGuards(JwtAuthGuard)
  async batchCostPreview(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query(new ZodValidationPipe(z.object({ count: z.coerce.number().int().min(1).max(7) })))
    query: { count: number },
  ) {
    return this.aiUsageService.checkBatchCost(req.user.id, query.count);
  }

  /**
   * 批次 AI 統計解讀。最多 7 項，額度不足自動以積分補差（每項 10 點）。
   * 不掛 @AiQuota；自行做成本檢查與扣費。
   */
  @Post('interpret-statistics/batch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async interpretStatisticsBatch(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body(new ZodValidationPipe(InterpretStatisticsBatchSchema)) dto: InterpretStatisticsBatchDto,
  ) {
    const userId = req.user.id;
    const count = dto.analyses.length;

    const preview = await this.aiUsageService.checkBatchCost(userId, count);
    if (!preview.canProceed) {
      throw new UnprocessableEntityException({
        message: '積分不足',
        needed: preview.pointsRequired,
        available: preview.pointsAvailable,
      });
    }

    const prepared = await Promise.all(
      dto.analyses.map((analysis) => this.prepareAdvancedAnalysisForAi(analysis, userId)),
    );

    const interpretations = await Promise.all(
      prepared.map((p) =>
        this.aiInsightsService.interpretStatistics(p.label, '問卷', p.result),
      ),
    );

    await this.aiUsageService.deductBatchCost(userId, preview.aiCovered, preview.pointsCovered);

    const results = dto.analyses.map((analysis, i) => {
      const { interpretation, caveats, generatedAt } = interpretations[i];
      const summaryMatch = interpretation.match(/^[^。.！!？?]+[。.！!？?]?/);
      const summary = summaryMatch ? summaryMatch[0].trim() : interpretation.slice(0, 80);
      return {
        analysisType: analysis.analysisType,
        params: analysis,
        result: prepared[i].result,
        interpretation,
        summary,
        caveats,
        generatedAt,
        costType: (i < preview.aiCovered ? 'ai' : 'points') as 'ai' | 'points',
      };
    });

    return {
      results,
      aiUsed: preview.aiCovered,
      pointsUsed: preview.pointsRequired,
    };
  }
}
