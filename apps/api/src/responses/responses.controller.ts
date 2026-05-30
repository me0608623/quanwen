import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  Headers,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response as ExpressResponse } from 'express';
import { ResponsesService } from './responses.service';
import { RespondentAssistantService } from './respondent-assistant.service';
import { AppealsService } from './appeals.service';
import { ReputationService } from './reputation.service';
import { ExportService } from './export.service';
import { AiInsightsService } from '../surveys/ai-insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SubmitResponseSchema, SubmitResponseDto } from './dto/submit-response.dto';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

const CreateAppealSchema = z.object({
  reason: z.string().min(5).max(2000),
});
type CreateAppealDto = z.infer<typeof CreateAppealSchema>;

// ─── 受試者用（前綴 /tasks）────────────────────────────────────────────────────

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private readonly responsesService: ResponsesService,
    private readonly respondentAssistant: RespondentAssistantService,
    private readonly appeals: AppealsService,
    private readonly reputation: ReputationService,
  ) {}

  /** GET /tasks?category=... — 可填問卷列表（依受眾媒合 + optional category 篩選） */
  @Get()
  getAvailable(@Req() req: Request, @Query('category') category?: string) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.getAvailableSurveys(user.id, category);
  }

  /** GET /tasks/category-counts — 各 category 的可填問卷計數 */
  @Get('category-counts')
  getCategoryCounts(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.getCategoryCounts(user.id);
  }

  /** GET /tasks/history — 自己的填答紀錄 */
  @Get('history')
  getMyResponses(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.getMyResponses(user.id);
  }

  /** GET /tasks/appeals — 自己的申訴狀態列表（Phase 6）*/
  @Get('appeals')
  getMyAppeals(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.appeals.getMyAppeals(user.id);
  }

  /** GET /tasks/reputation/history — 信譽分趨勢（Phase 7.2）*/
  @Get('reputation/history')
  getMyReputationHistory(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.reputation.getHistory(user.id, 20);
  }

  /** POST /tasks/responses/:id/appeal — 對 rejected 填答申訴（Phase 6）*/
  @Post('responses/:id/appeal')
  @HttpCode(HttpStatus.CREATED)
  createAppeal(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(CreateAppealSchema)) dto: CreateAppealDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.appeals.createAppeal(id, user.id, dto.reason);
  }

  /** GET /tasks/assistant — AI 推薦最適合的問卷 + 賺更多技巧 */
  @Get('assistant')
  getAssistant(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.respondentAssistant.recommend(user.id);
  }

  /** GET /tasks/:id — 公開問卷詳情（含題目） */
  @Get(':id')
  getPublic(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser | undefined;
    return this.responsesService.getPublicSurvey(id, user?.id);
  }

  /** POST /tasks/:id/submit — 提交填答 */
  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(SubmitResponseSchema)) dto: SubmitResponseDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.submitResponse(id, user.id, dto);
  }

}

const ANON_TOKEN_MAX_LENGTH = 256;

@Controller('public/tasks')
export class PublicTasksController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Get(':id')
  getPublic(
    @Param('id') id: string,
    @Headers('x-anon-token') anonToken: string | undefined,
  ) {
    const token = (anonToken ?? '').trim().slice(0, ANON_TOKEN_MAX_LENGTH);
    return this.responsesService.getPublicSurvey(id, undefined, token || undefined);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 10 } })
  submitPublic(
    @Param('id') id: string,
    @Headers('x-anon-token') anonToken: string | undefined,
    @Body(new ZodValidationPipe(SubmitResponseSchema)) dto: SubmitResponseDto,
  ) {
    const token = (anonToken ?? '').trim();
    if (token.length > ANON_TOKEN_MAX_LENGTH) {
      throw new BadRequestException('x-anon-token exceeds maximum length');
    }
    return this.responsesService.submitPublicResponse(id, dto, token || undefined);
  }
}

// ─── 問券方統計（掛在 /surveys/:id/stats）──────────────────────────────────────

@Controller('surveys')
@UseGuards(JwtAuthGuard)
export class ResponsesController {
  constructor(
    private readonly responsesService: ResponsesService,
    private readonly aiInsights: AiInsightsService,
    private readonly exportSvc: ExportService,
  ) {}

  /** GET /surveys/:id/respondents — 受訪者清單（匿名化 token） */
  @Get(':id/respondents')
  getRespondents(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.getRespondents(
      id,
      user.id,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  /** GET /surveys/:id/stats — 問券方查看填答統計 */
  @Get(':id/stats')
  getStats(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.getSurveyStats(id, user.id);
  }

  /** GET /surveys/:id/ai-insights?type=simple|detailed — AI 生成的填答洞察報告 */
  @Get(':id/ai-insights')
  async getAiInsights(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('type') type?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const reportType = type === 'detailed' ? 'detailed' : 'simple';
    const stats = await this.responsesService.getSurveyStats(id, user.id);
    return this.aiInsights.analyze(stats, reportType);
  }

  /** GET /surveys/:id/questions/:qid/sentiment — 開放題情緒分析 */
  @Get(':id/questions/:qid/sentiment')
  async getQuestionSentiment(
    @Param('id') surveyId: string,
    @Param('qid') questionId: string,
    @Req() req: Request,
  ) {
    const user = req.user as AuthenticatedUser;
    const stats = await this.responsesService.getSurveyStats(surveyId, user.id);
    const q = stats.questionStats.find((x: { questionId: string }) => x.questionId === questionId);
    if (!q) throw new ForbiddenException('題目不存在或無權存取');
    const texts = (q.sampleTexts ?? []).filter((t: string | null): t is string => !!t && t.trim().length > 0);
    return this.aiInsights.analyzeTextSentiment(q.title, texts);
  }

  /** GET /surveys/:id/analyze/sentiment?questionId=<qid> — 逐筆回應情緒 badges */
  @Get(':id/analyze/sentiment')
  async getResponseSentiments(
    @Param('id') surveyId: string,
    @Query('questionId') questionId: string | undefined,
    @Req() req: Request,
  ) {
    if (!questionId) {
      throw new BadRequestException('缺少 questionId 查詢參數');
    }
    const user = req.user as AuthenticatedUser;
    const answers = await this.responsesService.getTextAnswersForQuestion(
      surveyId,
      questionId,
      user.id,
    );
    return this.aiInsights.analyzeResponseSentiments(surveyId, questionId, answers);
  }

  /** GET /surveys/:id/analyze/cross-tab?field=gender|ageRange — 情緒 × 人口統計交叉分析 */
  @Get(':id/analyze/cross-tab')
  analyzeCrossTab(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('field') field?: string,
  ) {
    if (field !== 'gender' && field !== 'ageRange') {
      throw new BadRequestException('field must be one of: gender, ageRange');
    }
    const user = req.user as AuthenticatedUser;
    return this.responsesService.analyzeSentimentCrossTab(id, user.id, field);
  }

  /** GET /surveys/:id/trend — 近 30 天每日填答趨勢 */
  @Get(':id/trend')
  getTrend(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.responsesService.getSurveyTrend(id, user.id);
  }

  /** GET /surveys/:id/export.pdf — Phase R PDF stats 報表 */
  @Get(':id/export.pdf')
  async exportPdf(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ) {
    const user = req.user as AuthenticatedUser;
    const buf = await this.exportSvc.generateStatsPdf(id, user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_report.pdf"`);
    res.send(buf);
  }

  /** GET /surveys/:id/export.xlsx — Phase R Excel raw responses（含 quality column） */
  @Get(':id/export.xlsx')
  async exportXlsx(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Query('clean') clean?: string,
    @Query('minScore') minScore?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const isClean = clean === '1' || clean === 'true';
    const buf = await this.exportSvc.generateResponsesExcel(id, user.id, {
      cleanOnly: isClean,
      minQualityScore: minScore ? Number(minScore) : undefined,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const suffix = isClean ? '_clean' : '';
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_responses${suffix}.xlsx"`);
    res.send(buf);
  }

  /** GET /surveys/:id/export.json — 匯出結構化 JSON（survey + questions + 每筆 answers） */
  @Get(':id/export.json')
  async exportJson(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Query('clean') clean?: string,
    @Query('minScore') minScore?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const isClean = clean === '1' || clean === 'true';
    const data = await this.responsesService.exportSurveyResponsesJson(id, user.id, {
      cleanOnly: isClean,
      minQualityScore: minScore ? Number(minScore) : undefined,
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const suffix = isClean ? '_clean' : '';
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_responses${suffix}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }

  /** GET /surveys/:id/export.stream.csv — 串流匯出（去識別化 + 防注入；數千份不爆記憶體）*/
  @Get(':id/export.stream.csv')
  async exportStreamCsv(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Query('clean') clean?: string,
    @Query('minScore') minScore?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const isClean = clean === '1' || clean === 'true';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const suffix = isClean ? '_clean' : '';
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_responses${suffix}_stream.csv"`);
    await this.exportSvc.streamResponsesCsv(id, user.id, res, {
      cleanOnly: isClean,
      minQualityScore: minScore ? Number(minScore) : undefined,
    });
  }

  /** GET /surveys/:id/export.stream.md — 串流匯出 Markdown 報告（聚合摘要）*/
  @Get(':id/export.stream.md')
  async exportStreamMd(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ) {
    const user = req.user as AuthenticatedUser;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_report.md"`);
    await this.exportSvc.streamResponsesMarkdown(id, user.id, res);
  }

  /** GET /surveys/:id/export.stream.xlsx — 串流匯出 Excel（去識別化 + 批次）*/
  @Get(':id/export.stream.xlsx')
  async exportStreamXlsx(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Query('clean') clean?: string,
    @Query('minScore') minScore?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const isClean = clean === '1' || clean === 'true';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const suffix = isClean ? '_clean' : '';
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_responses${suffix}_stream.xlsx"`);
    await this.exportSvc.streamResponsesXlsx(id, user.id, res, {
      cleanOnly: isClean,
      minQualityScore: minScore ? Number(minScore) : undefined,
    });
  }

  /** GET /surveys/:id/export — 匯出 CSV */
  @Get(':id/export')
  async exportCsv(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Query('clean') clean?: string,
    @Query('minScore') minScore?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const isClean = clean === '1' || clean === 'true';
    const csv = await this.responsesService.exportSurveyResponsesCsv(id, user.id, {
      cleanOnly: isClean,
      minQualityScore: minScore ? Number(minScore) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const suffix = isClean ? '_clean' : '';
    res.setHeader('Content-Disposition', `attachment; filename="survey_${id}_responses${suffix}.csv"`);
    res.send('\uFEFF' + csv); // BOM for Excel 相容
  }

}
