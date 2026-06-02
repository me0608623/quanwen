import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, and, lte, isNotNull, lt, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

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
      await this.db
        .update(surveys)
        .set({
          status: 'published',
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(surveys.id, s.id));

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

  // ─── Shared close + notify logic ─────────────────────────────────────────

  private async closeSurveyAndNotify(
    surveyId: string,
    surveyorId: string,
    title: string,
    reason: string,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .update(surveys)
      .set({ status: 'closed', updatedAt: now })
      .where(eq(surveys.id, surveyId));

    this.logger.log(`Auto-closed survey ${surveyId} (${title}): ${reason}`);

    // Notify the survey creator
    try {
      await this.notifications.sendSurveyAutoCloseNotification(
        surveyorId,
        surveyId,
        title,
        reason,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to send auto-close notification for survey ${surveyId}: ${err}`,
      );
    }
  }
}
