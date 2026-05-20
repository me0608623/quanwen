import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, surveyResponses, users, transactions } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { SuspiciousAnalyzerService } from './suspicious-analyzer.service';
import { QualityAuditService } from '../responses/quality-audit.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly wallet: WalletService,
    private readonly suspiciousAnalyzer: SuspiciousAnalyzerService,
    private readonly qualityAudit: QualityAuditService,
  ) {}

  // ─── 問卷管理 ────────────────────────────────────────────────────────────────

  async getPendingSurveys() {
    const rows = await this.db
      .select({
        id: surveys.id,
        title: surveys.title,
        description: surveys.description,
        surveyorId: surveys.surveyorId,
        rewardPoints: surveys.rewardPoints,
        targetCount: surveys.targetCount,
        createdAt: surveys.createdAt,
        updatedAt: surveys.updatedAt,
      })
      .from(surveys)
      .where(eq(surveys.status, 'pending_review'))
      .orderBy(surveys.updatedAt);

    return rows;
  }

  async getAllSurveys(status?: string) {
    const condition = status
      ? eq(surveys.status, status as any)
      : undefined;

    return this.db
      .select({
        id: surveys.id,
        title: surveys.title,
        status: surveys.status,
        surveyorId: surveys.surveyorId,
        completedCount: surveys.completedCount,
        targetCount: surveys.targetCount,
        aiScore: surveys.aiScore,
        createdAt: surveys.createdAt,
      })
      .from(surveys)
      .where(condition)
      .orderBy(desc(surveys.createdAt))
      .limit(100);
  }

  async approveSurvey(surveyId: string) {
    const rows = await this.db
      .select({ id: surveys.id, title: surveys.title, surveyorId: surveys.surveyorId, status: surveys.status })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = rows[0];
    if (!survey) throw new NotFoundException('問卷不存在');

    const now = new Date();
    await this.db
      .update(surveys)
      .set({ status: 'published', publishedAt: now, updatedAt: now, aiRejectReason: null })
      .where(eq(surveys.id, surveyId));

    await this.notifications.create({
      userId: survey.surveyorId,
      type: 'survey_approved',
      title: `問卷「${survey.title}」已由管理員核准上架`,
      body: '您的問卷已通過人工審核，受試者現在可以填答。',
      metadata: { surveyId },
    });

    return { message: '問卷已核准上架', surveyId };
  }

  async rejectSurvey(surveyId: string, reason: string) {
    const rows = await this.db
      .select({ id: surveys.id, title: surveys.title, surveyorId: surveys.surveyorId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = rows[0];
    if (!survey) throw new NotFoundException('問卷不存在');

    await this.db
      .update(surveys)
      .set({ status: 'rejected', aiRejectReason: reason, updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));

    await this.notifications.create({
      userId: survey.surveyorId,
      type: 'survey_rejected',
      title: `問卷「${survey.title}」審核未通過`,
      body: `退回原因：${reason}`,
      metadata: { surveyId },
    });

    return { message: '問卷已退回', surveyId };
  }

  async closeSurvey(surveyId: string) {
    const rows = await this.db
      .select({
        id: surveys.id,
        surveyorId: surveys.surveyorId,
        completedCount: surveys.completedCount,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = rows[0];
    if (!survey) throw new NotFoundException('問卷不存在');

    await this.db
      .update(surveys)
      .set({ status: 'closed', updatedAt: new Date() })
      .where(eq(surveys.id, surveyId));

    // 退回未用預算（fire-and-forget）
    this.wallet
      .unlockSurveyBudget(survey.surveyorId, surveyId, survey.completedCount)
      .catch((err) => this.logger.error(`問卷關閉退款失敗 surveyId=${surveyId}`, err));

    return { message: '問卷已強制關閉', surveyId };
  }

  // ─── 提領管理 ─────────────────────────────────────────────────────────────

  async getPendingWithdrawals() {
    return this.wallet.getPendingWithdrawals();
  }

  async approveWithdrawal(transactionId: string) {
    await this.wallet.approveWithdrawal(transactionId);
    return { message: '提領已核准', transactionId };
  }

  async rejectWithdrawal(transactionId: string, reason: string) {
    await this.wallet.rejectWithdrawal(transactionId, reason);
    return { message: '提領已拒絕，款項已退回', transactionId };
  }

  // ─── 可疑填答管理 ────────────────────────────────────────────────────────────

  async getSuspiciousResponses(minScore = 60) {
    const rows = await this.db
      .select({
        id: surveyResponses.id,
        surveyId: surveyResponses.surveyId,
        respondentId: surveyResponses.respondentId,
        status: surveyResponses.status,
        antiCheatScore: surveyResponses.antiCheatScore,
        suspiciousFlags: surveyResponses.suspiciousFlags,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
        submittedAt: surveyResponses.submittedAt,
      })
      .from(surveyResponses)
      .where(gte(surveyResponses.antiCheatScore, minScore))
      .orderBy(desc(surveyResponses.antiCheatScore))
      .limit(100);

    return rows;
  }

  async rejectResponse(responseId: string) {
    await this.db
      .update(surveyResponses)
      .set({ status: 'rejected' })
      .where(eq(surveyResponses.id, responseId));

    return { message: '填答已標記為拒絕', responseId };
  }

  async reAuditResponse(responseId: string) {
    const rows = await this.db
      .select({
        id: surveyResponses.id,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.id, responseId))
      .limit(1);
    const r = rows[0];
    if (!r) throw new NotFoundException('填答不存在');

    const breakdown = await this.qualityAudit.audit(r.id, {
      fillDurationSeconds: r.fillDurationSeconds,
    });

    // 寫回 DB
    await this.db
      .update(surveyResponses)
      .set({
        qualityScore: breakdown.finalScore,
        qualityBreakdown: breakdown,
      })
      .where(eq(surveyResponses.id, r.id));

    return {
      message: '重新審核完成',
      responseId: r.id,
      breakdown,
    };
  }

  // ─── AI 分析可疑填答 ────────────────────────────────────────────────────────

  async analyzeSuspiciousResponse(responseId: string) {
    // 取 response + 對應 survey title
    const rows = await this.db
      .select({
        id: surveyResponses.id,
        antiCheatScore: surveyResponses.antiCheatScore,
        suspiciousFlags: surveyResponses.suspiciousFlags,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
        startedAt: surveyResponses.startedAt,
        submittedAt: surveyResponses.submittedAt,
        surveyTitle: surveys.title,
        targetCount: surveys.targetCount,
        rewardPoints: surveys.rewardPoints,
      })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(eq(surveyResponses.id, responseId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('填答紀錄不存在');
    }

    return this.suspiciousAnalyzer.analyze({
      surveyTitle: row.surveyTitle,
      rewardPoints: row.rewardPoints,
      antiCheatScore: row.antiCheatScore ?? 0,
      suspiciousFlags: Array.isArray(row.suspiciousFlags) ? row.suspiciousFlags as string[] : [],
      fillDurationSeconds: row.fillDurationSeconds,
    });
  }

  // ─── 平台統計 ────────────────────────────────────────────────────────────────

  async getPlatformStats() {
    const [allUsers, allSurveys, allResponses, revenueRows, thisMonthRevenueRows] =
      await Promise.all([
        this.db.select({ id: users.id, role: users.role }).from(users),
        this.db.select({ id: surveys.id, status: surveys.status }).from(surveys),
        this.db
          .select({ id: surveyResponses.id, status: surveyResponses.status, antiCheatScore: surveyResponses.antiCheatScore })
          .from(surveyResponses),
        // 累計平台手續費收入
        this.db
          .select({ total: sql<number>`COALESCE(SUM(amount), 0)::int` })
          .from(transactions)
          .where(and(eq(transactions.type, 'platform_fee'), eq(transactions.status, 'success'))),
        // 本月平台手續費收入
        this.db
          .select({ total: sql<number>`COALESCE(SUM(amount), 0)::int` })
          .from(transactions)
          .where(
            and(
              eq(transactions.type, 'platform_fee'),
              eq(transactions.status, 'success'),
              sql`completed_at >= date_trunc('month', NOW())`,
            ),
          ),
      ]);

    const surveyorCount = allUsers.filter((u) => u.role === 'surveyor').length;
    const respondentCount = allUsers.filter((u) => u.role === 'respondent').length;

    const surveyCounts = allSurveys.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    }, {});

    const suspiciousResponses = allResponses.filter(
      (r) => r.antiCheatScore !== null && r.antiCheatScore >= 60,
    ).length;

    return {
      totalUsers: allUsers.length,
      totalSurveyors: surveyorCount,
      totalRespondents: respondentCount,
      surveyCounts,
      totalResponses: allResponses.length,
      suspiciousResponses,
      platformRevenue: Number(revenueRows[0]?.total ?? 0),
      platformRevenueThisMonth: Number(thisMonthRevenueRows[0]?.total ?? 0),
    };
  }
}
