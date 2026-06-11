import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, and, lte, isNotNull, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { SurveysService } from './surveys.service';

/**
 * QUA-201: Scheduled publish and auto-close for surveys.
 *
 * Cron runs every minute to check for:
 * 1. Draft surveys whose scheduledPublishAt has passed → publish them
 * 2. Published surveys whose autoCloseAt has passed → close them
 * 3. Published surveys whose completedCount >= autoCloseAfterN → close them
 */
@Injectable()
export class SurveySchedulerService {
  private readonly logger = new Logger(SurveySchedulerService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly wallet: WalletService,
    private readonly surveysService: SurveysService,
  ) {}

  // ─── Scheduled publish: every minute ─────────────────────────────────────

  @Cron('* * * * *', { timeZone: 'Asia/Taipei' })
  async publishScheduledSurveys(): Promise<void> {
    const now = new Date();

    const due = await this.db
      .select({
        id: surveys.id,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
        type: surveys.type,
        rewardMode: surveys.rewardMode,
        lotteryTermsAcceptedAt: surveys.lotteryTermsAcceptedAt,
      })
      .from(surveys)
      .where(
        and(
          eq(surveys.status, 'draft'),
          isNotNull(surveys.scheduledPublishAt),
          lte(surveys.scheduledPublishAt, now),
        ),
      );

    if (due.length === 0) return;

    this.logger.log(`Publishing ${due.length} scheduled survey(s)`);

    for (const s of due) {
      if (s.rewardMode === 'lottery' && !s.lotteryTermsAcceptedAt) {
        await this.db
          .update(surveys)
          .set({ scheduledPublishAt: null, updatedAt: now })
          .where(eq(surveys.id, s.id));
        try {
          await this.notifications.create({
            userId: s.surveyorId,
            type: 'system',
            title: `「${s.title}」抽獎問卷未自動發布`,
            body: '請回到問卷設定重新確認獎品、開獎方式，並接受獎品履約條款後再發布。',
            metadata: { surveyId: s.id, lottery: true, termsAcceptanceRequired: true },
          });
        } catch (err) {
          this.logger.warn(`Failed to notify lottery terms requirement for survey ${s.id}: ${err}`);
        }
        continue;
      }
      await this.db
        .update(surveys)
        .set({
          status: 'published',
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(surveys.id, s.id));

      // 與手動 publish() 一致：標準（付費取樣）問卷需鎖定預算；mutual 不鎖。
      // 先前排程自動發布漏鎖，導致排程上架的問卷獎勵無資金保留。
      if (s.type !== 'mutual') {
        this.wallet.lockSurveyBudget(s.surveyorId, s.id).catch((err) =>
          this.logger.error(`排程發布預算鎖定失敗 surveyId=${s.id}`, err),
        );
      }

      this.logger.log(`Auto-published survey ${s.id} (${s.title})`);
    }
  }

  // ─── Auto-close by time: every minute ────────────────────────────────────

  @Cron('* * * * *', { timeZone: 'Asia/Taipei' })
  async autoCloseSurveysByTime(): Promise<void> {
    const now = new Date();

    const due = await this.db
      .select({
        id: surveys.id,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
      })
      .from(surveys)
      .where(
        and(
          eq(surveys.status, 'published'),
          isNotNull(surveys.autoCloseAt),
          lte(surveys.autoCloseAt, now),
        ),
      );

    if (due.length === 0) return;

    this.logger.log(`Auto-closing ${due.length} survey(s) by time`);

    for (const s of due) {
      await this.closeSurveyAndNotify(s.id, s.surveyorId, s.title, '時間到自動截止');
    }
  }

  // ─── Auto-close by response count: every minute ──────────────────────────

  @Cron('* * * * *', { timeZone: 'Asia/Taipei' })
  async autoCloseSurveysByCount(): Promise<void> {
    const due = await this.db
      .select({
        id: surveys.id,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
        completedCount: surveys.completedCount,
        autoCloseAfterN: surveys.autoCloseAfterN,
      })
      .from(surveys)
      .where(
        and(
          eq(surveys.status, 'published'),
          isNotNull(surveys.autoCloseAfterN),
          sql`${surveys.completedCount} >= ${surveys.autoCloseAfterN}`,
        ),
      );

    if (due.length === 0) return;

    this.logger.log(`Auto-closing ${due.length} survey(s) by response count`);

    for (const s of due) {
      await this.closeSurveyAndNotify(
        s.id,
        s.surveyorId,
        s.title,
        `已達 ${s.autoCloseAfterN} 份回應自動截止`,
      );
    }
  }

  // ─── Shared close + notify logic (delegated to SurveysService) ──────────

  private async closeSurveyAndNotify(
    surveyId: string,
    surveyorId: string,
    title: string,
    reason: string,
  ): Promise<void> {
    this.logger.log(`Auto-closing survey ${surveyId} (${title}): ${reason}`);
    await this.surveysService.executeCloseSurvey(surveyId, surveyorId, title, reason);
  }
}
