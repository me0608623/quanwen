import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, inArray, isNotNull, isNull, lte, notLike, or, sql } from 'drizzle-orm';
import { createHash, createHmac, randomBytes } from 'crypto';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveyLotteryResults, surveyResponses, surveys, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisLockService } from '../common/redis/redis-lock.service';

export function lotteryEligibleDigest(responseIds: string[]): string {
  return createHash('sha256').update([...responseIds].sort().join('\n')).digest('hex');
}

export function rankLotteryEntries<T extends { responseId: string }>(entries: T[], seed: string): T[] {
  return [...entries].sort((left, right) => {
    const leftRank = createHmac('sha256', seed).update(left.responseId).digest('hex');
    const rightRank = createHmac('sha256', seed).update(right.responseId).digest('hex');
    return leftRank.localeCompare(rightRank) || left.responseId.localeCompare(right.responseId);
  });
}

export function verifyLotteryAuditProof(
  entries: Array<{ responseId: string; isWinner: boolean }>,
  seed: string,
  eligibleDigest: string,
  winnerCount: number,
): boolean {
  if (lotteryEligibleDigest(entries.map((entry) => entry.responseId)) !== eligibleDigest) return false;
  const expectedWinnerIds = new Set(
    rankLotteryEntries(entries, seed)
      .slice(0, Math.min(winnerCount, entries.length))
      .map((entry) => entry.responseId),
  );
  return entries.every((entry) => expectedWinnerIds.has(entry.responseId) === entry.isWinner);
}

export function lotteryFulfillmentDueAt(drawnAt: Date | null): Date | null {
  return drawnAt ? new Date(drawnAt.getTime() + 7 * 24 * 60 * 60_000) : null;
}

@Injectable()
export class SurveyLotteryService {
  private readonly logger = new Logger(SurveyLotteryService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    @Optional() private readonly lock?: RedisLockService,
  ) {}

  async getSummary(surveyId: string, surveyorId: string) {
    const survey = await this.getLotterySurvey(surveyId);
    if (survey.surveyorId !== surveyorId) throw new ForbiddenException('無權存取此問卷抽獎');

    const results = await this.db
      .select({
        id: surveyLotteryResults.id,
        responseId: surveyLotteryResults.responseId,
        respondentId: surveyLotteryResults.respondentId,
        isWinner: surveyLotteryResults.isWinner,
        fulfillmentStatus: surveyLotteryResults.fulfillmentStatus,
        fulfillmentNote: surveyLotteryResults.fulfillmentNote,
        fulfilledAt: surveyLotteryResults.fulfilledAt,
        fulfillmentNotifiedAt: surveyLotteryResults.fulfillmentNotifiedAt,
        platformVerifiedAt: surveyLotteryResults.platformVerifiedAt,
        platformNote: surveyLotteryResults.platformNote,
        platformIntervenedAt: surveyLotteryResults.platformIntervenedAt,
        platformInterventionNote: surveyLotteryResults.platformInterventionNote,
        platformInterventionHistory: surveyLotteryResults.platformInterventionHistory,
        recipientStatus: surveyLotteryResults.recipientStatus,
        recipientConfirmedAt: surveyLotteryResults.recipientConfirmedAt,
        recipientConfirmedNotifiedAt: surveyLotteryResults.recipientConfirmedNotifiedAt,
        recipientIssueNote: surveyLotteryResults.recipientIssueNote,
        recipientIssueReportedAt: surveyLotteryResults.recipientIssueReportedAt,
        recipientIssueNotifiedAt: surveyLotteryResults.recipientIssueNotifiedAt,
        drawNotifiedAt: surveyLotteryResults.drawNotifiedAt,
      })
      .from(surveyLotteryResults)
      .where(eq(surveyLotteryResults.surveyId, surveyId));

    return {
      surveyId,
      rewardMode: survey.rewardMode,
      prize: survey.lotteryPrize,
      winnerCount: survey.lotteryWinnerCount,
      drawMode: survey.lotteryDrawMode,
      drawAt: survey.lotteryDrawAt,
      drawnAt: survey.lotteryDrawnAt,
      drawSeed: survey.lotteryDrawSeed,
      eligibleDigest: survey.lotteryEligibleDigest,
      creatorObligationNotifiedAt: survey.lotteryObligationNotifiedAt,
      drawAuditVerified: survey.lotteryDrawSeed && survey.lotteryEligibleDigest
        ? verifyLotteryAuditProof(results, survey.lotteryDrawSeed, survey.lotteryEligibleDigest, survey.lotteryWinnerCount ?? 1)
        : null,
      completedCount: survey.completedCount,
      targetCount: survey.targetCount,
      participantCount: results.length,
      notifiedParticipantCount: results.filter((r) => r.drawNotifiedAt).length,
      actualWinnerCount: results.filter((r) => r.isWinner).length,
      fulfillmentDueAt: lotteryFulfillmentDueAt(survey.lotteryDrawnAt),
      winners: results
        .filter((r) => r.isWinner)
        .map(({ respondentId: _respondentId, responseId: _responseId, isWinner: _isWinner, ...result }) => result),
    };
  }

  async getMyWinnings(respondentId: string) {
    const winnings = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyTitle: surveys.title,
        prize: surveyLotteryResults.prize,
        drawnAt: surveys.lotteryDrawnAt,
        fulfillmentStatus: surveyLotteryResults.fulfillmentStatus,
        fulfillmentNote: surveyLotteryResults.fulfillmentNote,
        fulfilledAt: surveyLotteryResults.fulfilledAt,
        platformVerifiedAt: surveyLotteryResults.platformVerifiedAt,
        platformIntervenedAt: surveyLotteryResults.platformIntervenedAt,
        platformInterventionNote: surveyLotteryResults.platformInterventionNote,
        platformInterventionHistory: surveyLotteryResults.platformInterventionHistory,
        recipientStatus: surveyLotteryResults.recipientStatus,
        recipientConfirmedAt: surveyLotteryResults.recipientConfirmedAt,
        recipientIssueNote: surveyLotteryResults.recipientIssueNote,
        recipientIssueReportedAt: surveyLotteryResults.recipientIssueReportedAt,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(and(eq(surveyLotteryResults.respondentId, respondentId), eq(surveyLotteryResults.isWinner, true)));
    return winnings.map((winning) => ({
      ...winning,
      fulfillmentDueAt: lotteryFulfillmentDueAt(winning.drawnAt),
    }));
  }

  async getMyLotteryResults(respondentId: string) {
    const results = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyTitle: surveys.title,
        prize: surveyLotteryResults.prize,
        isWinner: surveyLotteryResults.isWinner,
        drawnAt: surveys.lotteryDrawnAt,
        fulfillmentStatus: surveyLotteryResults.fulfillmentStatus,
        fulfillmentNote: surveyLotteryResults.fulfillmentNote,
        fulfilledAt: surveyLotteryResults.fulfilledAt,
        platformVerifiedAt: surveyLotteryResults.platformVerifiedAt,
        platformIntervenedAt: surveyLotteryResults.platformIntervenedAt,
        platformInterventionNote: surveyLotteryResults.platformInterventionNote,
        platformInterventionHistory: surveyLotteryResults.platformInterventionHistory,
        recipientStatus: surveyLotteryResults.recipientStatus,
        recipientConfirmedAt: surveyLotteryResults.recipientConfirmedAt,
        recipientIssueNote: surveyLotteryResults.recipientIssueNote,
        recipientIssueReportedAt: surveyLotteryResults.recipientIssueReportedAt,
        drawSeed: surveys.lotteryDrawSeed,
        eligibleDigest: surveys.lotteryEligibleDigest,
        winnerCount: surveys.lotteryWinnerCount,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(eq(surveyLotteryResults.respondentId, respondentId))
      .orderBy(desc(surveys.lotteryDrawnAt));
    if (results.length === 0) return [];

    const surveyIds = [...new Set(results.map((result) => result.surveyId))];
    const auditEntries = await this.db
      .select({
        surveyId: surveyLotteryResults.surveyId,
        responseId: surveyLotteryResults.responseId,
        isWinner: surveyLotteryResults.isWinner,
      })
      .from(surveyLotteryResults)
      .where(inArray(surveyLotteryResults.surveyId, surveyIds));
    const entriesBySurvey = new Map<string, typeof auditEntries>();
    for (const entry of auditEntries) {
      const entries = entriesBySurvey.get(entry.surveyId) ?? [];
      entries.push(entry);
      entriesBySurvey.set(entry.surveyId, entries);
    }

    return results.map(({ drawSeed, eligibleDigest, winnerCount, ...result }) => {
      const entries = entriesBySurvey.get(result.surveyId) ?? [];
      return {
        ...result,
        participantCount: entries.length,
        fulfillmentDueAt: lotteryFulfillmentDueAt(result.drawnAt),
        drawAuditVerified: drawSeed && eligibleDigest
          ? verifyLotteryAuditProof(entries, drawSeed, eligibleDigest, winnerCount ?? 1)
          : null,
      };
    });
  }

  async confirmReceipt(resultId: string, respondentId: string) {
    const [result] = await this.db
      .update(surveyLotteryResults)
      .set({ recipientStatus: 'received', recipientConfirmedAt: new Date(), recipientConfirmedNotifiedAt: null })
      .where(
        and(
          eq(surveyLotteryResults.id, resultId),
          eq(surveyLotteryResults.respondentId, respondentId),
          eq(surveyLotteryResults.isWinner, true),
          eq(surveyLotteryResults.fulfillmentStatus, 'notified'),
          inArray(surveyLotteryResults.recipientStatus, ['awaiting_delivery', 'issue_reported']),
        ),
      )
      .returning({ surveyId: surveyLotteryResults.surveyId });
    if (!result) throw new BadRequestException('尚未收到兌獎說明，或此案件已處理');
    await this.retryPendingReceiptConfirmationNotifications(resultId);
    return { id: resultId, recipientStatus: 'received' };
  }

  async reportIssue(resultId: string, respondentId: string, note: string) {
    const trimmedNote = note.trim();
    if (trimmedNote.length < 5 || trimmedNote.length > 1000) {
      throw new BadRequestException('問題說明需為 5 至 1000 字');
    }
    const [existing] = await this.db
      .select({
        fulfillmentStatus: surveyLotteryResults.fulfillmentStatus,
        recipientStatus: surveyLotteryResults.recipientStatus,
        drawnAt: surveys.lotteryDrawnAt,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(
        and(
          eq(surveyLotteryResults.id, resultId),
          eq(surveyLotteryResults.respondentId, respondentId),
          eq(surveyLotteryResults.isWinner, true),
        ),
      )
      .limit(1);
    const fulfillmentDueAt = lotteryFulfillmentDueAt(existing?.drawnAt ?? null);
    const overdueWithoutInstructions = existing?.fulfillmentStatus === 'pending'
      && !!fulfillmentDueAt
      && fulfillmentDueAt.getTime() < Date.now();
    if (
      !existing
      || existing.recipientStatus !== 'awaiting_delivery'
      || (existing.fulfillmentStatus !== 'notified' && !overdueWithoutInstructions)
    ) {
      throw new BadRequestException('尚未符合回報條件，或此案件已處理');
    }
    const [result] = await this.db
      .update(surveyLotteryResults)
      .set({
        recipientStatus: 'issue_reported',
        recipientIssueNote: trimmedNote,
        recipientIssueReportedAt: new Date(),
      })
      .where(
        and(
          eq(surveyLotteryResults.id, resultId),
          eq(surveyLotteryResults.respondentId, respondentId),
          eq(surveyLotteryResults.isWinner, true),
          inArray(surveyLotteryResults.fulfillmentStatus, ['pending', 'notified']),
          eq(surveyLotteryResults.recipientStatus, 'awaiting_delivery'),
        ),
      )
      .returning({ surveyId: surveyLotteryResults.surveyId });
    if (!result) throw new BadRequestException('尚未符合回報條件，或此案件已處理');
    await this.retryPendingIssueNotifications(resultId);
    return { id: resultId, recipientStatus: 'issue_reported' };
  }

  async fulfill(surveyId: string, surveyorId: string, note: string) {
    const survey = await this.getLotterySurvey(surveyId);
    if (survey.surveyorId !== surveyorId) throw new ForbiddenException('無權處理此問卷抽獎');
    if (!survey.lotteryDrawnAt) throw new BadRequestException('尚未開獎，無法送出兌獎通知');

    const trimmedNote = note.trim();
    if (trimmedNote.length < 5 || trimmedNote.length > 1000) {
      throw new BadRequestException('兌獎說明需為 5 至 1000 字');
    }

    const winners = await this.db
      .update(surveyLotteryResults)
      .set({
        fulfillmentStatus: 'notified',
        fulfillmentNote: trimmedNote,
        fulfilledAt: new Date(),
      })
      .where(
        and(
          eq(surveyLotteryResults.surveyId, surveyId),
          eq(surveyLotteryResults.isWinner, true),
          eq(surveyLotteryResults.fulfillmentStatus, 'pending'),
        ),
      )
      .returning({ respondentId: surveyLotteryResults.respondentId });

    if (winners.length === 0) throw new BadRequestException('兌獎說明已送出，無需重複通知');

    await this.retryPendingFulfillmentNotifications(surveyId);

    return this.getSummary(surveyId, surveyorId);
  }

  async fulfillWinner(surveyId: string, resultId: string, surveyorId: string, note: string) {
    const survey = await this.getLotterySurvey(surveyId);
    if (survey.surveyorId !== surveyorId) throw new ForbiddenException('無權處理此問卷抽獎');
    if (!survey.lotteryDrawnAt) throw new BadRequestException('尚未開獎，無法送出兌獎通知');

    const trimmedNote = note.trim();
    if (trimmedNote.length < 5 || trimmedNote.length > 1000) {
      throw new BadRequestException('兌獎說明需為 5 至 1000 字');
    }

    const [winner] = await this.db
      .update(surveyLotteryResults)
      .set({
        fulfillmentStatus: 'notified',
        fulfillmentNote: trimmedNote,
        fulfilledAt: new Date(),
      })
      .where(
        and(
          eq(surveyLotteryResults.id, resultId),
          eq(surveyLotteryResults.surveyId, surveyId),
          eq(surveyLotteryResults.isWinner, true),
          eq(surveyLotteryResults.fulfillmentStatus, 'pending'),
        ),
      )
      .returning({ id: surveyLotteryResults.id });

    if (!winner) throw new BadRequestException('此中獎者已通知，或查無待履約中獎紀錄');

    await this.retryPendingFulfillmentNotifications(surveyId);

    return this.getSummary(surveyId, surveyorId);
  }

  async draw(surveyId: string, surveyorId?: string, allowPartialClosed = false) {
    const survey = await this.getLotterySurvey(surveyId);
    if (surveyorId && survey.surveyorId !== surveyorId) {
      throw new ForbiddenException('無權執行此問卷抽獎');
    }
    if (survey.lotteryDrawnAt) {
      return this.getSummary(surveyId, survey.surveyorId);
    }
    if (!['published', 'closed'].includes(survey.status)) {
      throw new BadRequestException('問卷尚未發布，無法開獎');
    }
    if (!survey.lotteryTermsAcceptedAt) {
      throw new BadRequestException('抽獎問卷缺少獎品履約條款同意紀錄，無法開獎');
    }
    const canDrawPartialClosed = allowPartialClosed && survey.status === 'closed';
    if (
      (survey.lotteryDrawMode === 'manual' || survey.lotteryDrawMode === 'when_full')
      && survey.completedCount < survey.targetCount
      && !canDrawPartialClosed
    ) {
      throw new BadRequestException('問卷尚未收滿，無法開獎');
    }
    if (
      survey.lotteryDrawMode === 'scheduled'
      && (!survey.lotteryDrawAt || survey.lotteryDrawAt.getTime() > Date.now())
    ) {
      throw new BadRequestException('尚未到指定開獎時間');
    }

    const drawnAt = new Date();

    const claimed = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(surveys)
        .set({
          status: 'closed',
          updatedAt: drawnAt,
        })
        .where(and(eq(surveys.id, surveyId), isNull(surveys.lotteryDrawnAt)))
        .returning({ id: surveys.id });

      if (rows.length === 0) return false;

      const pendingAudit = await tx
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(and(
          eq(surveyResponses.surveyId, surveyId),
          or(
            eq(surveyResponses.status, 'pending_review'),
            and(
              inArray(surveyResponses.status, ['submitted', 'rewarded']),
              isNull(surveyResponses.qualityScore),
            ),
          ),
        ))
        .limit(1);
      if (pendingAudit.length > 0) {
        throw new BadRequestException('仍有填答正在品質審核，請稍後再開獎');
      }

      const eligible = await tx
        .select({
          responseId: surveyResponses.id,
          respondentId: surveyResponses.respondentId,
        })
        .from(surveyResponses)
        .innerJoin(users, eq(surveyResponses.respondentId, users.id))
        .where(
          and(
            eq(surveyResponses.surveyId, surveyId),
            inArray(surveyResponses.status, ['submitted', 'rewarded']),
            isNotNull(surveyResponses.qualityScore),
            notLike(users.email, 'anon+%@guest.quanwen.local'),
          ),
      );

      if (eligible.length === 0) throw new BadRequestException('目前沒有可參加抽獎的有效填答');
      if (
        (survey.lotteryDrawMode === 'manual' || survey.lotteryDrawMode === 'when_full')
        && eligible.length < survey.targetCount
        && !canDrawPartialClosed
      ) {
        throw new BadRequestException('有效填答尚未收滿，請等待品質審核或繼續收集');
      }

      const winnerCount = Math.min(survey.lotteryWinnerCount ?? 1, eligible.length);
      const drawSeed = randomBytes(32).toString('hex');
      const eligibleDigest = lotteryEligibleDigest(eligible.map((entry) => entry.responseId));
      const ranked = rankLotteryEntries(eligible, drawSeed);
      const winnerIds = new Set(ranked.slice(0, winnerCount).map((r) => r.respondentId));

      await tx
        .update(surveys)
        .set({ lotteryDrawnAt: drawnAt, lotteryDrawSeed: drawSeed, lotteryEligibleDigest: eligibleDigest })
        .where(eq(surveys.id, surveyId));

      await tx.insert(surveyLotteryResults).values(
        eligible.map((entry) => ({
          surveyId,
          responseId: entry.responseId,
          respondentId: entry.respondentId,
          isWinner: winnerIds.has(entry.respondentId),
          prize: survey.lotteryPrize!,
          fulfillmentStatus: winnerIds.has(entry.respondentId) ? 'pending' : 'not_applicable',
          recipientStatus: winnerIds.has(entry.respondentId) ? 'awaiting_delivery' : 'not_applicable',
        })),
      );
      return { participantCount: eligible.length, winnerCount };
    });

    if (!claimed) return this.getSummary(surveyId, survey.surveyorId);

    await this.retryPendingDrawNotifications(surveyId);
    await this.retryPendingCreatorObligationNotifications(surveyId);

    this.logger.log(`Survey lottery drawn: survey=${surveyId} participants=${claimed.participantCount} winners=${claimed.winnerCount}`);
    return this.getSummary(surveyId, survey.surveyorId);
  }

  @Cron('* * * * *', { timeZone: 'Asia/Taipei' })
  async drawDueLotteriesCron(): Promise<void> {
    await this.runCronWithLock('draw-due', 55_000, () => this.drawDueLotteries());
  }

  async drawDueLotteries(): Promise<void> {
    const now = new Date();
    const due = await this.db
      .select({ id: surveys.id })
      .from(surveys)
      .where(
        and(
          eq(surveys.rewardMode, 'lottery'),
          inArray(surveys.status, ['published', 'closed']),
          isNotNull(surveys.lotteryTermsAcceptedAt),
          isNull(surveys.lotteryDrawnAt),
          or(
            and(
              eq(surveys.lotteryDrawMode, 'scheduled'),
              lte(surveys.lotteryDrawAt, now),
            ),
            and(
              eq(surveys.lotteryDrawMode, 'when_full'),
              sql`${surveys.completedCount} >= ${surveys.targetCount}`,
            ),
            and(
              eq(surveys.status, 'closed'),
              sql`${surveys.completedCount} > 0`,
            ),
          ),
        ),
      );

    for (const survey of due) {
      try {
        await this.draw(survey.id, undefined, true);
      } catch (err) {
        this.logger.warn(`Survey lottery draw skipped: survey=${survey.id} reason=${String(err)}`);
      }
    }
  }

  @Cron('*/5 * * * *', { timeZone: 'Asia/Taipei' })
  async retryPendingDrawNotificationsCron(): Promise<void> {
    await this.runCronWithLock('draw-notifications', 290_000, () => this.retryPendingDrawNotifications());
  }

  async retryPendingDrawNotifications(surveyId?: string): Promise<void> {
    const rows = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        respondentId: surveyLotteryResults.respondentId,
        isWinner: surveyLotteryResults.isWinner,
        prize: surveyLotteryResults.prize,
        title: surveys.title,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(
        surveyId
          ? and(eq(surveyLotteryResults.surveyId, surveyId), isNull(surveyLotteryResults.drawNotifiedAt))
          : isNull(surveyLotteryResults.drawNotifiedAt),
      );

    for (const row of rows) {
      // 先原子佔位（drawNotifiedAt: null → now），搶不到就跳過 → 兩個 worker 併發不會重複通知。
      const claimed = await this.db
        .update(surveyLotteryResults)
        .set({ drawNotifiedAt: new Date() })
        .where(and(eq(surveyLotteryResults.id, row.id), isNull(surveyLotteryResults.drawNotifiedAt)))
        .returning({ id: surveyLotteryResults.id });
      if (claimed.length === 0) continue;

      try {
        await this.notifications.create({
          userId: row.respondentId,
          type: 'system',
          title: row.isWinner ? '恭喜！您抽中問卷獎品' : '問卷抽獎結果通知',
          body: row.isWinner
            ? `您參加的問卷「${row.title}」已開獎，恭喜抽中「${row.prize}」。請留意後續兌獎通知。`
            : `您參加的問卷「${row.title}」已開獎，本次未抽中「${row.prize}」。感謝您的參與。`,
          metadata: { surveyId: row.surveyId, lottery: true, isWinner: row.isWinner, prize: row.prize },
        });
      } catch (err) {
        // 通知失敗 → 釋放佔位，讓下一輪 cron 重試。
        await this.db
          .update(surveyLotteryResults)
          .set({ drawNotifiedAt: null })
          .where(eq(surveyLotteryResults.id, row.id));
        this.logger.warn(`Survey lottery notification retry pending: result=${row.id} reason=${String(err)}`);
      }
    }
  }

  @Cron('*/5 * * * *', { timeZone: 'Asia/Taipei' })
  async retryPendingCreatorObligationNotificationsCron(): Promise<void> {
    await this.runCronWithLock('creator-obligation-notifications', 290_000, () => this.retryPendingCreatorObligationNotifications());
  }

  async retryPendingCreatorObligationNotifications(surveyId?: string): Promise<void> {
    const rows = await this.db
      .select({
        id: surveys.id,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
        prize: surveys.lotteryPrize,
        winnerCount: surveys.lotteryWinnerCount,
        drawnAt: surveys.lotteryDrawnAt,
      })
      .from(surveys)
      .where(
        and(
          eq(surveys.rewardMode, 'lottery'),
          sql`${surveys.lotteryDrawnAt} IS NOT NULL`,
          isNull(surveys.lotteryObligationNotifiedAt),
          surveyId ? eq(surveys.id, surveyId) : undefined,
        ),
      );

    for (const row of rows) {
      if (!row.drawnAt) continue;
      const fulfillmentDueAt = lotteryFulfillmentDueAt(row.drawnAt)!;
      try {
        await this.notifications.create({
          userId: row.surveyorId,
          type: 'system',
          title: `「${row.title}」抽獎已完成，請履行獎品交付義務`,
          body: `系統已抽出 ${row.winnerCount ?? 1} 位中獎者。請於 ${fulfillmentDueAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 前至問卷統計頁送出兌獎方式並交付「${row.prize}」。平台會保留通知與核驗紀錄。`,
          metadata: { surveyId: row.id, lottery: true, fulfillmentRequired: true, fulfillmentDueAt },
        });
        await this.db
          .update(surveys)
          .set({ lotteryObligationNotifiedAt: new Date() })
          .where(and(eq(surveys.id, row.id), isNull(surveys.lotteryObligationNotifiedAt)));
      } catch (err) {
        this.logger.warn(`Survey lottery creator obligation notification retry pending: survey=${row.id} reason=${String(err)}`);
      }
    }
  }

  @Cron('*/5 * * * *', { timeZone: 'Asia/Taipei' })
  async retryPendingFulfillmentNotificationsCron(): Promise<void> {
    await this.runCronWithLock('fulfillment-notifications', 290_000, () => this.retryPendingFulfillmentNotifications());
  }

  async retryPendingFulfillmentNotifications(surveyId?: string): Promise<void> {
    const rows = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        respondentId: surveyLotteryResults.respondentId,
        prize: surveyLotteryResults.prize,
        fulfillmentNote: surveyLotteryResults.fulfillmentNote,
        title: surveys.title,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(
        and(
          eq(surveyLotteryResults.isWinner, true),
          eq(surveyLotteryResults.fulfillmentStatus, 'notified'),
          isNull(surveyLotteryResults.fulfillmentNotifiedAt),
          surveyId ? eq(surveyLotteryResults.surveyId, surveyId) : undefined,
        ),
      );

    for (const row of rows) {
      if (!row.fulfillmentNote) continue;
      try {
        await this.notifications.create({
          userId: row.respondentId,
          type: 'system',
          title: `「${row.title}」抽獎兌獎通知`,
          body: `您抽中的「${row.prize}」已由問卷建立者送出兌獎說明：\n${row.fulfillmentNote}\n平台已保留此履約紀錄，若未收到獎品可聯絡平台協助。`,
          metadata: { surveyId: row.surveyId, lottery: true, fulfillment: true, prize: row.prize },
        });
        await this.db
          .update(surveyLotteryResults)
          .set({ fulfillmentNotifiedAt: new Date() })
          .where(and(eq(surveyLotteryResults.id, row.id), isNull(surveyLotteryResults.fulfillmentNotifiedAt)));
      } catch (err) {
        this.logger.warn(`Survey lottery fulfillment notification retry pending: result=${row.id} reason=${String(err)}`);
      }
    }
  }

  @Cron('*/5 * * * *', { timeZone: 'Asia/Taipei' })
  async retryPendingIssueNotificationsCron(): Promise<void> {
    await this.runCronWithLock('issue-notifications', 290_000, () => this.retryPendingIssueNotifications());
  }

  async retryPendingIssueNotifications(resultId?: string): Promise<void> {
    const rows = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
        recipientIssueNote: surveyLotteryResults.recipientIssueNote,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(
        and(
          eq(surveyLotteryResults.recipientStatus, 'issue_reported'),
          isNull(surveyLotteryResults.recipientIssueNotifiedAt),
          resultId ? eq(surveyLotteryResults.id, resultId) : undefined,
        ),
      );
    if (rows.length === 0) return;

    const admins = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    for (const row of rows) {
      const body = `問卷「${row.title}」中獎者回報問題：${row.recipientIssueNote}`;
      try {
        await this.notifications.create({
          userId: row.surveyorId,
          type: 'system',
          title: '中獎者回報尚未收到獎品',
          body,
          metadata: { surveyId: row.surveyId, lottery: true, recipientIssueReported: true },
        });
        await Promise.all(
          admins.map((admin) => this.notifications.create({
            userId: admin.id,
            type: 'system',
            title: '中獎者回報尚未收到獎品',
            body,
            metadata: { surveyId: row.surveyId, lottery: true, recipientIssueReported: true },
          })),
        );
        await this.db
          .update(surveyLotteryResults)
          .set({ recipientIssueNotifiedAt: new Date() })
          .where(and(eq(surveyLotteryResults.id, row.id), isNull(surveyLotteryResults.recipientIssueNotifiedAt)));
      } catch (err) {
        this.logger.warn(`Survey lottery issue notification retry pending: result=${row.id} reason=${String(err)}`);
      }
    }
  }

  @Cron('*/5 * * * *')
  async retryPendingReceiptConfirmationNotificationsCron(): Promise<void> {
    await this.runCronWithLock('receipt-confirmation-notifications', 290_000, () => this.retryPendingReceiptConfirmationNotifications());
  }

  async retryPendingReceiptConfirmationNotifications(resultId?: string): Promise<void> {
    const pending = await this.db
      .select({
        id: surveyLotteryResults.id,
        surveyId: surveyLotteryResults.surveyId,
        surveyorId: surveys.surveyorId,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(and(
        eq(surveyLotteryResults.recipientStatus, 'received'),
        isNull(surveyLotteryResults.recipientConfirmedNotifiedAt),
        resultId ? eq(surveyLotteryResults.id, resultId) : undefined,
      ));
    if (pending.length === 0) return;

    const admins = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    for (const row of pending) {
      try {
        const notification = {
          type: 'system' as const,
          title: '中獎者已確認收到獎品',
          body: '中獎者已確認收到獎品，平台可進行履約核驗。',
          metadata: { surveyId: row.surveyId, lottery: true, recipientConfirmed: true },
        };
        await this.notifications.create({ ...notification, userId: row.surveyorId });
        await Promise.all(admins.map((admin) => this.notifications.create({ ...notification, userId: admin.id })));
        await this.db
          .update(surveyLotteryResults)
          .set({ recipientConfirmedNotifiedAt: new Date() })
          .where(and(
            eq(surveyLotteryResults.id, row.id),
            isNull(surveyLotteryResults.recipientConfirmedNotifiedAt),
          ));
      } catch (err) {
        this.logger.warn(`Survey lottery receipt confirmation notification retry pending: result=${row.id} reason=${String(err)}`);
      }
    }
  }

  @Cron('*/5 * * * *')
  async remindOverdueFulfillmentsCron(): Promise<void> {
    await this.runCronWithLock('overdue-fulfillment-reminders', 290_000, () => this.remindOverdueFulfillments());
  }

  async remindOverdueFulfillments(): Promise<void> {
    const now = new Date();
    const overdueBefore = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const reminderBefore = new Date(now.getTime() - 24 * 60 * 60_000);
    const overdue = await this.db
      .select({
        resultId: surveyLotteryResults.id,
        surveyId: surveys.id,
        title: surveys.title,
        surveyorId: surveys.surveyorId,
        respondentId: surveyLotteryResults.respondentId,
        recipientStatus: surveyLotteryResults.recipientStatus,
      })
      .from(surveyLotteryResults)
      .innerJoin(surveys, eq(surveyLotteryResults.surveyId, surveys.id))
      .where(
        and(
          eq(surveyLotteryResults.isWinner, true),
          isNull(surveyLotteryResults.platformVerifiedAt),
          lte(surveys.lotteryDrawnAt, overdueBefore),
          or(
            isNull(surveyLotteryResults.lastReminderAt),
            lte(surveyLotteryResults.lastReminderAt, reminderBefore),
          ),
        ),
      );
    if (overdue.length === 0) return;

    const grouped = new Map<string, {
      surveyId: string;
      title: string;
      surveyorId: string;
      resultIds: string[];
      followUpRespondentIds: Set<string>;
    }>();
    for (const row of overdue) {
      const item = grouped.get(row.surveyId) ?? { ...row, resultIds: [], followUpRespondentIds: new Set<string>() };
      item.resultIds.push(row.resultId);
      if (row.recipientStatus !== 'received') {
        item.followUpRespondentIds.add(row.respondentId);
      }
      grouped.set(row.surveyId, item);
    }
    const admins = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));

    for (const item of grouped.values()) {
      const body = `問卷「${item.title}」有 ${item.resultIds.length} 筆中獎履約紀錄已超過開獎後七日仍未完成平台核驗，請儘速處理。`;
      try {
        await this.notifications.create({
          userId: item.surveyorId,
          type: 'system',
          title: '抽獎獎品履約已逾期',
          body,
          metadata: { surveyId: item.surveyId, lottery: true, fulfillmentOverdue: true },
        });
        await Promise.all([
          ...admins.map((admin) =>
            this.notifications.create({
            userId: admin.id,
            type: 'system',
            title: '平台保證案件逾期提醒',
            body,
            metadata: { surveyId: item.surveyId, lottery: true, fulfillmentOverdue: true },
          }),
        ),
        ...[...item.followUpRespondentIds].map((respondentId) =>
          this.notifications.create({
            userId: respondentId,
            type: 'system',
            title: '抽獎獎品履約逾期，平台已追蹤',
            body: `${body} 平台已通知問卷建立者並列入保證案件追蹤；若仍未收到獎品，請至抽獎回饋紀錄回報。`,
              metadata: { surveyId: item.surveyId, lottery: true, fulfillmentOverdue: true, platformTracking: true },
            }),
          ),
        ]);
        await this.db
          .update(surveyLotteryResults)
          .set({ lastReminderAt: now })
          .where(inArray(surveyLotteryResults.id, item.resultIds));
      } catch (err) {
        this.logger.warn(`Survey lottery overdue notification retry pending: survey=${item.surveyId} reason=${String(err)}`);
      }
    }
  }

  private async getLotterySurvey(surveyId: string) {
    const [survey] = await this.db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!survey) throw new NotFoundException('問卷不存在');
    if (
      survey.rewardMode !== 'lottery' ||
      !survey.lotteryPrize ||
      !survey.lotteryWinnerCount ||
      !survey.lotteryDrawMode
    ) {
      throw new BadRequestException('此問卷未設定抽獎回饋');
    }
    return survey;
  }

  private async runCronWithLock(key: string, ttlMs: number, fn: () => Promise<void>): Promise<void> {
    if (this.lock) {
      await this.lock.withLock(`qw:lock:lottery:${key}`, ttlMs, fn);
      return;
    }
    await fn();
  }

}
