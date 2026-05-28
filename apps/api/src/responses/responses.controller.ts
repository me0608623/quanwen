import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
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

// ─── 問券方統計（掛在 /surveys/:id/stats）──────────────────────────────────────

@Controller('surveys')
@UseGuards(JwtAuthGuard)
export class ResponsesController {
  constructor(
    private readonly responsesService: ResponsesService,
    private readonly aiInsights: AiInsightsService,
    private readonly exportSvc: ExportService,
  ) {}

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
