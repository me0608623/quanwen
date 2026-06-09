import {
  Controller, Get, Post, Body, Param, Query, Req,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';
import { AiAuditService } from '../ai-audit/ai-audit.service';
import { MutualService } from '../mutual/mutual.service';
import { PlatformHealthService } from './platform-health.service';
import { WithdrawalRiskService } from './withdrawal-risk.service';
import { AppealsService } from '../responses/appeals.service';
import { ResponsesService } from '../responses/responses.service';
import { ReconciliationService } from '../wallet/reconciliation.service';
import { MultiAccountDetectorService } from './multi-account-detector.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

const RejectSurveySchema = z.object({ reason: z.string().min(1).max(500) });
type RejectSurveyDto = z.infer<typeof RejectSurveySchema>;

const RejectWithdrawalSchema = z.object({ reason: z.string().min(1).max(200) });
type RejectWithdrawalDto = z.infer<typeof RejectWithdrawalSchema>;

const ApproveAppealSchema = z.object({ adminNote: z.string().max(500).optional() });
type ApproveAppealDto = z.infer<typeof ApproveAppealSchema>;

const DismissAppealSchema = z.object({ adminNote: z.string().min(5).max(500) });
type DismissAppealDto = z.infer<typeof DismissAppealSchema>;

const VerifyLotterySchema = z.object({ adminNote: z.string().max(500).optional() });
type VerifyLotteryDto = z.infer<typeof VerifyLotterySchema>;

const InterveneLotterySchema = z.object({ adminNote: z.string().trim().min(5).max(500) });
type InterveneLotteryDto = z.infer<typeof InterveneLotterySchema>;

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly aiAudit: AiAuditService,
    private readonly platformHealth: PlatformHealthService,
    private readonly withdrawalRisk: WithdrawalRiskService,
    private readonly appeals: AppealsService,
    private readonly responses: ResponsesService,
    private readonly reconciliation: ReconciliationService,
    private readonly multiAccountDetector: MultiAccountDetectorService,
    private readonly mutualService: MutualService,
  ) {}

  // ─── 統計總覽 ────────────────────────────────────────────────────────────────
  @Get('stats')
  getStats() {
    return this.adminService.getPlatformStats();
  }

  /** GET /admin/health-summary — AI 平台健康摘要 (預設 30 分鐘 cache, ?force=1 強制重算) */
  @Get('health-summary')
  async getHealthSummary(@Query('force') force?: string) {
    const stats = await this.adminService.getPlatformStats();
    return this.platformHealth.summarize(stats, { force: force === '1' || force === 'true' });
  }

  /** GET /admin/surveys/:id/ai-review — AI 給審核諮詢意見（不改 DB）*/
  @Get('surveys/:id/ai-review')
  aiReview(@Param('id') id: string) {
    return this.aiAudit.evaluateSurvey(id);
  }

  /**
   * GET /admin/surveys/:id/encrypted-answers
   * 超級管理員專用：解密某問卷的「個資加密題」答案（問卷方看不到明文）。
   */
  @Get('surveys/:id/encrypted-answers')
  getEncryptedAnswers(@Param('id') id: string) {
    return this.responses.getEncryptedAnswersForAdmin(id);
  }

  // ─── 問卷管理 ────────────────────────────────────────────────────────────────

  /** GET /admin/surveys?status=pending_review */
  @Get('surveys')
  getSurveys(@Query('status') status?: string) {
    if (status === 'pending_review') return this.adminService.getPendingSurveys();
    return this.adminService.getAllSurveys(status);
  }

  /** POST /admin/surveys/:id/approve */
  @Post('surveys/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveSurvey(@Param('id') id: string) {
    return this.adminService.approveSurvey(id);
  }

  /** POST /admin/surveys/:id/reject */
  @Post('surveys/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectSurvey(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RejectSurveySchema)) dto: RejectSurveyDto,
  ) {
    return this.adminService.rejectSurvey(id, dto.reason);
  }

  /** POST /admin/surveys/:id/close */
  @Post('surveys/:id/close')
  @HttpCode(HttpStatus.OK)
  closeSurvey(@Param('id') id: string) {
    return this.adminService.closeSurvey(id);
  }

  /** GET /admin/lottery-obligations — 平台保證人檢視中獎履約紀錄 */
  @Get('lottery-obligations')
  getLotteryObligations() {
    return this.adminService.getLotteryObligations();
  }

  /** POST /admin/lottery-obligations/:id/verify — 平台核驗建立者已履約 */
  @Post('lottery-obligations/:id/verify')
  @HttpCode(HttpStatus.OK)
  verifyLotteryFulfillment(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(VerifyLotterySchema)) dto: VerifyLotteryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.adminService.verifyLotteryFulfillment(id, user.id, dto.adminNote);
  }

  /** POST /admin/lottery-obligations/:id/intervene — 留存平台介入爭議處理紀錄 */
  @Post('lottery-obligations/:id/intervene')
  @HttpCode(HttpStatus.OK)
  interveneLotteryIssue(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(InterveneLotterySchema)) dto: InterveneLotteryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.adminService.interveneLotteryIssue(id, user.id, dto.adminNote);
  }

  // ─── 填答管理 ────────────────────────────────────────────────────────────────

  /** GET /admin/responses/suspicious?minScore=60 */
  @Get('responses/suspicious')
  getSuspicious(@Query('minScore') minScore?: string) {
    return this.adminService.getSuspiciousResponses(minScore ? Number(minScore) : 60);
  }

  /** POST /admin/responses/:id/reject */
  @Post('responses/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectResponse(@Param('id') id: string) {
    return this.adminService.rejectResponse(id);
  }

  /** POST /admin/responses/:id/approve — 人工核准待審填答 */
  @Post('responses/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveResponse(@Param('id') id: string) {
    return this.responses.approvePendingResponse(id);
  }

  /** GET /admin/responses/:id/ai-analysis — AI 解讀此筆可疑填答 */
  @Get('responses/:id/ai-analysis')
  responseAiAnalysis(@Param('id') id: string) {
    return this.adminService.analyzeSuspiciousResponse(id);
  }

  /** POST /admin/responses/:id/re-audit — 手動觸發 quality audit pipeline */
  @Post('responses/:id/re-audit')
  @HttpCode(HttpStatus.OK)
  async reAudit(@Param('id') id: string) {
    return this.responses.retryQualityAudit(id);
  }

  // ─── 提領管理 ────────────────────────────────────────────────────────────────

  /** GET /admin/withdrawals */
  @Get('withdrawals')
  getPendingWithdrawals() {
    return this.adminService.getPendingWithdrawals();
  }

  /** POST /admin/withdrawals/:id/approve */
  @Post('withdrawals/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveWithdrawal(@Param('id') id: string, @Req() req: Request) {
    const user = (req as unknown as { user: AuthenticatedUser }).user;
    const ip = extractIp(req);
    return this.adminService.approveWithdrawal(id, user.id, ip);
  }

  /** GET /admin/withdrawals/:id/ai-risk — AI 詐欺風險評估 */
  @Get('withdrawals/:id/ai-risk')
  withdrawalAiRisk(@Param('id') id: string) {
    return this.withdrawalRisk.assessRisk(id);
  }

  /** POST /admin/withdrawals/:id/reject */
  @Post('withdrawals/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectWithdrawal(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(RejectWithdrawalSchema)) dto: RejectWithdrawalDto,
  ) {
    const user = (req as unknown as { user: AuthenticatedUser }).user;
    const ip = extractIp(req);
    return this.adminService.rejectWithdrawal(id, dto.reason, user.id, ip);
  }

  // ─── 對帳（Phase 8）────────────────────────────────────────────────────────

  /** GET /admin/reconciliation — 跑一次對帳並回報結果 */
  @Get('reconciliation')
  runReconciliation() {
    return this.reconciliation.runDaily();
  }

  /** GET /admin/users/:id/multi-account-scan — 對單一用戶跑多帳號偵測（Phase D.6）*/
  @Get('users/:id/multi-account-scan')
  scanMultiAccount(@Param('id') id: string) {
    return this.multiAccountDetector.scanUser(id);
  }

  // ─── 互惠配對管理（Phase B）─────────────────────────────────────────────

  /** GET /admin/mutual?status=matched — 列出所有互惠配對 */
  @Get('mutual')
  listMutualPairs(@Query('status') status?: string) {
    return this.adminService.listAllMutualPairs(status);
  }

  /** POST /admin/mutual/match-now — 立刻跑一次配對(demo / 不想等 30 秒 cron) */
  @Post('mutual/match-now')
  @HttpCode(HttpStatus.OK)
  async matchNow() {
    await this.mutualService.matchWaitingPairs();
    return { message: 'matcher cron triggered' };
  }

  /** POST /admin/mutual/:id/cancel — 強制取消配對 */
  @Post('mutual/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async forceCancelMutual(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().min(1).max(500) }))) dto: { reason: string },
  ) {
    const user = req.user as AuthenticatedUser;
    await this.adminService.forceCancelMutualPair(id, dto.reason, user.id);
    return { message: '配對已取消' };
  }

  // ─── 申訴管理（Phase 6）────────────────────────────────────────────────────

  /** GET /admin/appeals?status=pending */
  @Get('appeals')
  listAppeals(@Query('status') status?: 'pending' | 'approved' | 'dismissed') {
    return this.appeals.listAppeals(status);
  }

  /** POST /admin/appeals/:id/approve */
  @Post('appeals/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveAppeal(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(ApproveAppealSchema)) dto: ApproveAppealDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.appeals.approveAppeal(id, user.id, dto.adminNote);
  }

  /** POST /admin/appeals/:id/dismiss */
  @Post('appeals/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismissAppeal(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(DismissAppealSchema)) dto: DismissAppealDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.appeals.dismissAppeal(id, user.id, dto.adminNote);
  }
}

function extractIp(req: Request): string {
  const forwarded = (req.headers as Record<string, string | string[] | undefined>)['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() ?? 'unknown';
  }
  return (req as unknown as { ip?: string }).ip ?? 'unknown';
}
