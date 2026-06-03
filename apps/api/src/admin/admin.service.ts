import { BadRequestException, Injectable, Inject, NotFoundException, Logger, ConflictException, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, and, desc, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, surveyResponses, users, transactions, mutualPairs, surveyLotteryResults } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { SuspiciousAnalyzerService } from './suspicious-analyzer.service';
import { QualityAuditService } from '../responses/quality-audit.service';
import { verifyLotteryAuditProof } from '../surveys/survey-lottery.service';
import { RedisLockService } from '../common/redis/redis-lock.service';

export function lotteryObligationPriority(item: {
  recipientStatus: string;
  isOverdue: boolean;
  platformVerifiedAt: Date | null;
}): number {
  if (item.recipientStatus === 'issue_reported') return 0;
  if (item.isOverdue) return 1;
  if (!item.platformVerifiedAt) return 2;
  return 3;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly wallet: WalletService,
    private readonly suspiciousAnalyzer: SuspiciousAnalyzerService,
    private readonly qualityAudit: QualityAuditService,
    @Optional() private readonly lock?: RedisLockService,
  ) {}

  // ─── 問卷管理 ────────────────────────────────────────────────────────────────

  async getLotteryObligations() {
    const rows = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveys.id,
        surveyTitle: surveys.title,
        surveyorId: surveys.surveyorId,
        respondentId: surveyLotteryResults.respondentId,
        prize: surveyLotteryResults.prize,
        fulfillmentStatus: surveyLotteryResults.fulfillmentStatus,
        fulfillmentNote: surveyLotteryResults.fulfillmentNote,
        fulfilledAt: surveyLotteryResults.fulfilledAt,
        fulfillmentNotifiedAt: surveyLotteryResults.fulfillmentNotifiedAt,
        platformVerifiedAt: surveyLotteryResults.platformVerifiedAt,
        platformNote: surveyLotteryResults.platformNote,
        platformVerifiedNotifiedAt: surveyLotteryResults.platformVerifiedNotifiedAt,
        platformIntervenedAt: surveyLotteryResults.platformIntervenedAt,
        platformInterventionNote: surveyLotteryResults.platformInterventionNote,
        platformInterventionNotifiedAt: surveyLotteryResults.platformInterventionNotifiedAt,
        platformInterventionHistory: surveyLotteryResults.platformInterventionHistory,
        recipientStatus: surveyLotteryResults.recipientStatus,
        recipientConfirmedAt: surveyLotteryResults.recipientConfirmedAt,
        recipientConfirmedNotifiedAt: surveyLotteryResults.recipientConfirmedNotifiedAt,
        recipientIssueNote: surveyLotteryResults.recipientIssueNote,
        recipientIssueReportedAt: surveyLotteryResults.recipientIssueReportedAt,
        recipientIssueNotifiedAt: surveyLotteryResults.recipientIssueNotifiedAt,
        drawNotifiedAt: surveyLotteryResults.drawNotifiedAt,
        drawnAt: surveys.lotteryDrawnAt,
        drawSeed: surveys.lotteryDrawSeed,
        eligibleDigest: surveys.lotteryEligibleDigest,
        winnerCount: surveys.lotteryWinnerCount,
        lotteryTermsAcceptedAt: surveys.lotteryTermsAcceptedAt,
        creatorObligationNotifiedAt: surveys.lotteryObligationNotifiedAt,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(eq(surveyLotteryResults.isWinner, true))
      .orderBy(desc(surveys.lotteryDrawnAt));

    const surveyIds = [...new Set(rows.map((row) => row.surveyId))];
    const auditRows = surveyIds.length === 0
      ? []
      : await this.db
        .select({
          surveyId: surveyLotteryResults.surveyId,
          responseId: surveyLotteryResults.responseId,
          isWinner: surveyLotteryResults.isWinner,
        })
        .from(surveyLotteryResults)
        .where(inArray(surveyLotteryResults.surveyId, surveyIds));
    const auditRowsBySurvey = new Map<string, Array<{ responseId: string; isWinner: boolean }>>();
    for (const auditRow of auditRows) {
      const entries = auditRowsBySurvey.get(auditRow.surveyId) ?? [];
      entries.push(auditRow);
      auditRowsBySurvey.set(auditRow.surveyId, entries);
    }
    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      drawAuditVerified: row.drawSeed && row.eligibleDigest
        ? verifyLotteryAuditProof(auditRowsBySurvey.get(row.surveyId) ?? [], row.drawSeed, row.eligibleDigest, row.winnerCount ?? 1)
        : null,
      fulfillmentDueAt: row.drawnAt ? new Date(row.drawnAt.getTime() + 7 * 24 * 60 * 60_000) : null,
      isOverdue:
        !!row.drawnAt &&
        !row.platformVerifiedAt &&
        now > row.drawnAt.getTime() + 7 * 24 * 60 * 60_000,
    })).sort((a, b) => (
      lotteryObligationPriority(a) - lotteryObligationPriority(b)
      || (b.drawnAt?.getTime() ?? 0) - (a.drawnAt?.getTime() ?? 0)
    ));
  }

  async verifyLotteryFulfillment(resultId: string, adminId: string, note?: string) {
    const [result] = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyorId: surveys.surveyorId,
        respondentId: surveyLotteryResults.respondentId,
        title: surveys.title,
        prize: surveyLotteryResults.prize,
        isWinner: surveyLotteryResults.isWinner,
        fulfillmentStatus: surveyLotteryResults.fulfillmentStatus,
        recipientStatus: surveyLotteryResults.recipientStatus,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(eq(surveyLotteryResults.id, resultId))
      .limit(1);

    if (!result || !result.isWinner) throw new NotFoundException('查無中獎履約紀錄');
    if (result.fulfillmentStatus === 'verified') throw new ConflictException('此履約案件已完成平台核驗');
    if (result.fulfillmentStatus !== 'notified') throw new NotFoundException('建立者尚未送出兌獎說明');
    if (result.recipientStatus !== 'received') throw new NotFoundException('中獎者尚未確認收到獎品');

    const verifiedAt = new Date();
    const claimed = await this.db
      .update(surveyLotteryResults)
      .set({
        fulfillmentStatus: 'verified',
        platformVerifiedAt: verifiedAt,
        platformVerifiedBy: adminId,
        platformNote: note?.trim().slice(0, 500) || null,
        platformVerifiedNotifiedAt: null,
      })
      .where(and(
        eq(surveyLotteryResults.id, resultId),
        eq(surveyLotteryResults.fulfillmentStatus, 'notified'),
        isNull(surveyLotteryResults.platformVerifiedAt),
      ))
      .returning({ id: surveyLotteryResults.id });
    if (claimed.length === 0) throw new ConflictException('此履約案件已完成平台核驗');

    await this.retryPendingLotteryVerificationNotifications(resultId);

    return { id: resultId, platformVerifiedAt: verifiedAt };
  }

  @Cron('*/5 * * * *')
  async retryPendingLotteryVerificationNotificationsCron(): Promise<void> {
    await this.runCronWithLock('verification-notifications', () => this.retryPendingLotteryVerificationNotifications());
  }

  async retryPendingLotteryVerificationNotifications(resultId?: string): Promise<void> {
    const pending = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyorId: surveys.surveyorId,
        respondentId: surveyLotteryResults.respondentId,
        title: surveys.title,
        prize: surveyLotteryResults.prize,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(and(
        isNotNull(surveyLotteryResults.platformVerifiedAt),
        isNull(surveyLotteryResults.platformVerifiedNotifiedAt),
        resultId ? eq(surveyLotteryResults.id, resultId) : undefined,
      ));

    for (const row of pending) {
      try {
        await this.notifications.create({
          userId: row.respondentId,
          type: 'system',
          title: `「${row.title}」獎品履約已由平台核驗`,
          body: `您抽中的「${row.prize}」已完成平台履約核驗。若實際未收到獎品，請聯絡平台客服。`,
          metadata: { surveyId: row.surveyId, lottery: true, platformVerified: true },
        });
        await this.notifications.create({
          userId: row.surveyorId,
          type: 'system',
          title: `「${row.title}」抽獎履約已核驗`,
          body: '平台已完成一筆中獎者履約核驗，感謝您履行抽獎回饋義務。',
          metadata: { surveyId: row.surveyId, lottery: true, platformVerified: true },
        });
        await this.db
          .update(surveyLotteryResults)
          .set({ platformVerifiedNotifiedAt: new Date() })
          .where(and(
            eq(surveyLotteryResults.id, row.id),
            isNull(surveyLotteryResults.platformVerifiedNotifiedAt),
          ));
      } catch (err) {
        this.logger.warn(`Lottery platform verification notification retry pending: result=${row.id} reason=${String(err)}`);
      }
    }
  }

  async interveneLotteryIssue(resultId: string, adminId: string, note: string) {
    const platformInterventionNote = note.trim();
    if (platformInterventionNote.length < 5 || platformInterventionNote.length > 500) {
      throw new BadRequestException('平台介入說明需為 5 至 500 字');
    }
    const [result] = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyorId: surveys.surveyorId,
        respondentId: surveyLotteryResults.respondentId,
        title: surveys.title,
        prize: surveyLotteryResults.prize,
        isWinner: surveyLotteryResults.isWinner,
        recipientStatus: surveyLotteryResults.recipientStatus,
        drawnAt: surveys.lotteryDrawnAt,
        platformVerifiedAt: surveyLotteryResults.platformVerifiedAt,
        platformIntervenedAt: surveyLotteryResults.platformIntervenedAt,
        platformInterventionNotifiedAt: surveyLotteryResults.platformInterventionNotifiedAt,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(eq(surveyLotteryResults.id, resultId))
      .limit(1);

    if (!result || !result.isWinner) throw new NotFoundException('查無中獎履約紀錄');
    const isOverdue = !!result.drawnAt
      && !result.platformVerifiedAt
      && Date.now() > result.drawnAt.getTime() + 7 * 24 * 60 * 60_000;
    if (result.recipientStatus !== 'issue_reported' && !isOverdue) {
      throw new NotFoundException('中獎者尚未回報問題且履約期限尚未逾期');
    }
    if (result.platformIntervenedAt && !result.platformInterventionNotifiedAt) {
      await this.retryPendingLotteryInterventionNotifications(resultId);
      const [pending] = await this.db
        .select({ platformInterventionNotifiedAt: surveyLotteryResults.platformInterventionNotifiedAt })
        .from(surveyLotteryResults)
        .where(eq(surveyLotteryResults.id, resultId))
        .limit(1);
      if (!pending?.platformInterventionNotifiedAt) {
        throw new ConflictException('前次平台介入通知仍待補送，請稍後再新增處理紀錄');
      }
    }

    const platformIntervenedAt = new Date();
    const intervention = {
      intervenedAt: platformIntervenedAt.toISOString(),
      adminId,
      reason: result.recipientStatus === 'issue_reported' ? 'winner_issue' : 'fulfillment_overdue',
      note: platformInterventionNote,
    };
    const claimed = await this.db
      .update(surveyLotteryResults)
      .set({
        platformIntervenedAt,
        platformIntervenedBy: adminId,
        platformInterventionNote,
        platformInterventionNotifiedAt: null,
        platformInterventionHistory: sql`${surveyLotteryResults.platformInterventionHistory} || ${JSON.stringify([intervention])}::jsonb`,
      })
      .where(and(
        eq(surveyLotteryResults.id, resultId),
        result.platformIntervenedAt
          ? eq(surveyLotteryResults.platformIntervenedAt, result.platformIntervenedAt)
          : isNull(surveyLotteryResults.platformIntervenedAt),
        result.platformInterventionNotifiedAt
          ? eq(surveyLotteryResults.platformInterventionNotifiedAt, result.platformInterventionNotifiedAt)
          : isNull(surveyLotteryResults.platformInterventionNotifiedAt),
      ))
      .returning({ id: surveyLotteryResults.id });
    if (claimed.length === 0) throw new ConflictException('案件已有新的平台介入紀錄，請重新整理後再試');

    await this.retryPendingLotteryInterventionNotifications(resultId);

    return { id: resultId, platformIntervenedAt, platformInterventionNote, intervention };
  }

  @Cron('*/5 * * * *')
  async retryPendingLotteryInterventionNotificationsCron(): Promise<void> {
    await this.runCronWithLock('intervention-notifications', () => this.retryPendingLotteryInterventionNotifications());
  }

  async retryPendingLotteryInterventionNotifications(resultId?: string): Promise<void> {
    const pending = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyorId: surveys.surveyorId,
        respondentId: surveyLotteryResults.respondentId,
        title: surveys.title,
        prize: surveyLotteryResults.prize,
        recipientStatus: surveyLotteryResults.recipientStatus,
        platformInterventionNote: surveyLotteryResults.platformInterventionNote,
        platformInterventionHistory: surveyLotteryResults.platformInterventionHistory,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(and(
        isNotNull(surveyLotteryResults.platformIntervenedAt),
        isNull(surveyLotteryResults.platformInterventionNotifiedAt),
        resultId ? eq(surveyLotteryResults.id, resultId) : undefined,
      ));

    for (const row of pending) {
      if (!row.platformInterventionNote) continue;
      const latestIntervention = row.platformInterventionHistory[row.platformInterventionHistory.length - 1];
      const reason = latestIntervention?.reason === 'fulfillment_overdue'
        ? '案件已超過履約期限'
        : row.recipientStatus === 'issue_reported'
        ? '中獎者回報獎品問題'
        : '案件已超過履約期限';
      try {
        await this.notifications.create({
          userId: row.respondentId,
          type: 'system',
          title: `平台已介入「${row.title}」獎品問題`,
          body: `平台已針對您抽中「${row.prize}」的履約案件開始協助處理：\n${row.platformInterventionNote}`,
          metadata: { surveyId: row.surveyId, lottery: true, platformIntervened: true },
        });
        await this.notifications.create({
          userId: row.surveyorId,
          type: 'system',
          title: `平台已介入「${row.title}」抽獎履約問題`,
          body: `${reason}，平台處理說明：\n${row.platformInterventionNote}\n請儘速完成交付並請中獎者確認收到。`,
          metadata: { surveyId: row.surveyId, lottery: true, platformIntervened: true },
        });
        await this.db
          .update(surveyLotteryResults)
          .set({ platformInterventionNotifiedAt: new Date() })
          .where(and(
            eq(surveyLotteryResults.id, row.id),
            isNull(surveyLotteryResults.platformInterventionNotifiedAt),
          ));
      } catch (err) {
        this.logger.warn(`Lottery platform intervention notification retry pending: result=${row.id} reason=${String(err)}`);
      }
    }
  }

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

  private async runCronWithLock(key: string, fn: () => Promise<void>): Promise<void> {
    if (this.lock) {
      await this.lock.withLock(`qw:lock:admin-lottery:${key}`, 290_000, fn);
      return;
    }
    await fn();
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
        surveyTitle: surveys.title,
        respondentId: surveyResponses.respondentId,
        status: surveyResponses.status,
        antiCheatScore: sql<number>`COALESCE(${surveyResponses.antiCheatScore}, 0)::int`,
        suspiciousFlags: sql<string[]>`COALESCE(${surveyResponses.suspiciousFlags}, '[]'::jsonb)`,
        fillDurationSeconds: surveyResponses.fillDurationSeconds,
        submittedAt: surveyResponses.submittedAt,
      })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(or(
        gte(surveyResponses.antiCheatScore, minScore),
        eq(surveyResponses.status, 'pending_review'),
      ))
      .orderBy(desc(surveyResponses.antiCheatScore))
      .limit(100);

    return rows;
  }

  async rejectResponse(responseId: string) {
    const [response] = await this.db
      .select({
        status: surveyResponses.status,
        surveyId: surveyResponses.surveyId,
        rewardMode: surveys.rewardMode,
        lotteryDrawnAt: surveys.lotteryDrawnAt,
      })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(eq(surveyResponses.id, responseId))
      .limit(1);
    if (!response) throw new NotFoundException('填答不存在');
    if (response.status === 'rejected') {
      return { message: '填答已標記為拒絕', responseId };
    }

    const wasAccepted = ['submitted', 'rewarded'].includes(response.status);
    if (wasAccepted && response.rewardMode === 'lottery' && response.lotteryDrawnAt) {
      throw new ConflictException('抽獎已完成，無法改寫參與名單；請改走平台履約介入流程');
    }
    if (wasAccepted) {
      const paidRewards = await this.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(
          eq(transactions.relatedResponseId, responseId),
          eq(transactions.type, 'reward_in'),
          eq(transactions.status, 'success'),
        ))
        .limit(1);
      if (paidRewards.length > 0) {
        throw new ConflictException('獎勵已入帳，需先處理款項追回後才能拒絕填答');
      }
    }

    await this.db.transaction(async (tx) => {
      const rejected = await tx
        .update(surveyResponses)
        .set({ status: 'rejected' })
        .where(eq(surveyResponses.id, responseId))
        .returning({ id: surveyResponses.id });
      if (rejected.length === 0 || !wasAccepted) return;

      await tx
        .update(surveys)
        .set({
          completedCount: sql`GREATEST(${surveys.completedCount} - 1, 0)`,
          status: sql`CASE WHEN ${surveys.status} = 'closed' THEN 'published'::survey_status ELSE ${surveys.status} END`,
        })
        .where(and(
          eq(surveys.id, response.surveyId),
          response.rewardMode === 'lottery' ? isNull(surveys.lotteryDrawnAt) : undefined,
        ));
    });

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
    const [allUsers, allSurveys, allResponses, revenueRows, thisMonthRevenueRows, allMutual] =
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
        this.db.select({ id: mutualPairs.id, status: mutualPairs.status }).from(mutualPairs),
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

    const mutualCounts = allMutual.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalUsers: allUsers.length,
      totalSurveyors: surveyorCount,
      totalRespondents: respondentCount,
      surveyCounts,
      totalResponses: allResponses.length,
      suspiciousResponses,
      platformRevenue: Number(revenueRows[0]?.total ?? 0),
      platformRevenueThisMonth: Number(thisMonthRevenueRows[0]?.total ?? 0),
      mutualCounts,
      mutualTotal: allMutual.length,
    };
  }

  // ─── Phase B 互惠：admin 看全部 pair 並可手動取消 ────────────────────────

  async listAllMutualPairs(statusFilter?: string) {
    const rows = await this.db
      .select()
      .from(mutualPairs)
      .orderBy(desc(mutualPairs.createdAt));

    const filtered = statusFilter
      ? rows.filter((r) => r.status === statusFilter)
      : rows;

    // 撈 user displayName + survey title
    const userIds = new Set<string>();
    const surveyIds = new Set<string>();
    for (const r of filtered) {
      userIds.add(r.aUserId);
      surveyIds.add(r.aSurveyId);
      if (r.bUserId) userIds.add(r.bUserId);
      if (r.bSurveyId) surveyIds.add(r.bSurveyId);
    }

    const userRows = userIds.size
      ? await this.db
          .select({ id: users.id, displayName: users.displayName, email: users.email })
          .from(users)
      : [];
    const surveyRows = surveyIds.size
      ? await this.db
          .select({ id: surveys.id, title: surveys.title, category: surveys.category })
          .from(surveys)
      : [];

    const userById = new Map(userRows.map((u) => [u.id, u]));
    const surveyById = new Map(surveyRows.map((s) => [s.id, s]));

    return filtered.map((r) => ({
      id: r.id,
      status: r.status,
      a: {
        userId: r.aUserId,
        displayName: userById.get(r.aUserId)?.displayName ?? '(unknown)',
        email: userById.get(r.aUserId)?.email ?? '',
        surveyId: r.aSurveyId,
        surveyTitle: surveyById.get(r.aSurveyId)?.title ?? '(unknown)',
        category: surveyById.get(r.aSurveyId)?.category ?? null,
        filledAt: r.aFilledAt,
      },
      b: r.bUserId
        ? {
            userId: r.bUserId,
            displayName: userById.get(r.bUserId)?.displayName ?? '(unknown)',
            email: userById.get(r.bUserId)?.email ?? '',
            surveyId: r.bSurveyId,
            surveyTitle: r.bSurveyId ? (surveyById.get(r.bSurveyId)?.title ?? '(unknown)') : null,
            category: r.bSurveyId ? (surveyById.get(r.bSurveyId)?.category ?? null) : null,
            filledAt: r.bFilledAt,
          }
        : null,
      matchedAt: r.matchedAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  async forceCancelMutualPair(pairId: string, reason: string, adminId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(mutualPairs)
      .where(eq(mutualPairs.id, pairId))
      .limit(1);
    const pair = rows[0];
    if (!pair) throw new NotFoundException('配對不存在');
    if (pair.status === 'both_done' || pair.status === 'cancelled' || pair.status === 'expired') {
      return; // 已是終端狀態，無 op
    }

    await this.db
      .update(mutualPairs)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(mutualPairs.id, pairId));

    this.logger.warn(`Admin force-cancelled mutual pair ${pairId}: ${reason} by ${adminId.slice(0, 8)}`);

    await this.notifications.create({
      userId: pair.aUserId,
      type: 'system',
      title: '互惠配對被取消 (admin)',
      body: `管理員手動取消配對：${reason}`,
      metadata: { pairId },
    });
    if (pair.bUserId) {
      await this.notifications.create({
        userId: pair.bUserId,
        type: 'system',
        title: '互惠配對被取消 (admin)',
        body: `管理員手動取消配對：${reason}`,
        metadata: { pairId },
      });
    }
  }
}
