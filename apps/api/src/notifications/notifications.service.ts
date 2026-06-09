import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, sql, gte, lt, lte } from 'drizzle-orm';
import { Cron } from '@nestjs/schedule';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  notifications,
  users,
  surveyorProfiles,
  surveys,
  pendingNotifications,
} from '../db/schema';
import type { NewNotification, PendingNotification } from '../db/schema';
import { MailService } from '../mail/mail.service';

// 哪些 type 要 email 推播
const EMAIL_TYPES = new Set<NewNotification['type']>([
  'survey_approved',
  'survey_rejected',
  'new_response',
  'system',
]);

const NEW_RESPONSE_EMAIL_COOLDOWN_MINUTES = 15;

/** Retry delays in seconds for attempt 1, 2, 3 */
const RETRY_DELAYS_SEC = [5, 30, 300] as const;
const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly mail: MailService,
  ) {}

  // ─── 建立通知（供其他 service 呼叫）──────────────────────────────────────────

  async create(dto: Omit<NewNotification, 'id' | 'isRead' | 'createdAt'>): Promise<void> {
    // 先寫入 pending_notifications（durable job record），確保失敗可重試
    const [pending] = await this.db
      .insert(pendingNotifications)
      .values({
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        metadata: dto.metadata,
        nextRetryAt: new Date(),
      })
      .returning();

    await this._processOne(pending);
  }

  /** 執行一筆 pending notification：insert notifications + 寄 email；失敗時記錄重試排程 */
  async _processOne(pending: PendingNotification): Promise<void> {
    try {
      await this.db.insert(notifications).values({
        userId: pending.userId,
        type: pending.type,
        title: pending.title,
        body: pending.body,
        metadata: pending.metadata,
      });

      await this.db
        .update(pendingNotifications)
        .set({ status: 'done', updatedAt: new Date() })
        .where(eq(pendingNotifications.id, pending.id));

      if (EMAIL_TYPES.has(pending.type)) {
        const metadata = pending.metadata as Record<string, unknown> | undefined;
        void this._sendEmail(
          pending.userId,
          pending.title,
          pending.body ?? '',
          pending.type,
          metadata,
        ).catch((err: unknown) =>
          this.logger.error(`通知 email 寄送失敗 userId=${pending.userId}`, err),
        );
      }
    } catch (err: unknown) {
      const newAttempts = pending.attempts + 1;
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (newAttempts >= MAX_ATTEMPTS) {
        await this.db
          .update(pendingNotifications)
          .set({ status: 'failed', attempts: newAttempts, lastError: errorMsg, updatedAt: new Date() })
          .where(eq(pendingNotifications.id, pending.id));
        this.logger.error(`通知永久失敗 pendingId=${pending.id} attempts=${newAttempts}`, err);
      } else {
        const delaySec = RETRY_DELAYS_SEC[newAttempts - 1] ?? 300;
        await this.db
          .update(pendingNotifications)
          .set({
            attempts: newAttempts,
            lastError: errorMsg,
            nextRetryAt: new Date(Date.now() + delaySec * 1000),
            updatedAt: new Date(),
          })
          .where(eq(pendingNotifications.id, pending.id));
        this.logger.warn(
          `通知失敗，${delaySec}s 後重試 pendingId=${pending.id} attempt=${newAttempts}`,
        );
      }
    }
  }

  // ─── 重試 cron（每 30 秒，只處理 attempts>=1 的重試項目）───────────────────

  @Cron('*/30 * * * * *')
  async retryPendingNotifications(): Promise<void> {
    const rows = await this.db
      .select()
      .from(pendingNotifications)
      .where(
        and(
          eq(pendingNotifications.status, 'pending'),
          lte(pendingNotifications.nextRetryAt, new Date()),
          gte(pendingNotifications.attempts, 1),
        ),
      )
      .limit(20);

    for (const row of rows) {
      await this._processOne(row).catch((err: unknown) =>
        this.logger.error(`重試通知失敗 pendingId=${row.id}`, err),
      );
    }
  }

  // ─── internal email helpers ───────────────────────────────────────────────

  private async isNewResponseEmailThrottled(userId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - NEW_RESPONSE_EMAIL_COOLDOWN_MINUTES * 60_000);
    const rows = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.type, 'new_response'),
          gte(notifications.createdAt, cutoff),
        ),
      );
    return (rows[0]?.count ?? 0) > 1;
  }

  private async _sendEmail(
    userId: string,
    title: string,
    body: string,
    type: NewNotification['type'],
    metadata?: Record<string, unknown>,
  ) {
    if (type === 'new_response') {
      const digestRows = await this.db
        .select({ responseNotifMode: surveyorProfiles.responseNotifMode })
        .from(surveyorProfiles)
        .where(eq(surveyorProfiles.userId, userId))
        .limit(1);
      if (digestRows[0]?.responseNotifMode === 'daily_digest') {
        this.logger.debug(`new_response email skipped for userId=${userId} (daily_digest mode)`);
        return;
      }
      const throttled = await this.isNewResponseEmailThrottled(userId);
      if (throttled) {
        this.logger.debug(
          `new_response email throttled for userId=${userId} (cooldown=${NEW_RESPONSE_EMAIL_COOLDOWN_MINUTES}min)`,
        );
        return;
      }
    }

    const rows = await this.db
      .select({
        email: users.email,
        displayName: users.displayName,
        emailVerified: users.emailVerified,
        emailOptOut: users.emailOptOut,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user || !user.emailVerified) return;
    if (user.emailOptOut) return;
    if (user.email.endsWith('.placeholder')) return;

    void metadata; // reserved for future use
    await this.mail.sendNotificationEmail(user.email, user.displayName, title, body);
  }

  // ─── QUA-200: 每日填答摘要（每天 08:00 台北時間）────────────────────────────

  @Cron('0 0 * * *', { timeZone: 'Asia/Taipei' })
  async sendDailyDigests(): Promise<void> {
    this.logger.log('daily digest cron started');

    const digestUsers = await this.db
      .select({
        userId: surveyorProfiles.userId,
        email: users.email,
        displayName: users.displayName,
        emailVerified: users.emailVerified,
        emailOptOut: users.emailOptOut,
      })
      .from(surveyorProfiles)
      .innerJoin(users, eq(surveyorProfiles.userId, users.id))
      .where(eq(surveyorProfiles.responseNotifMode, 'daily_digest'));

    const windowStart = new Date(Date.now() - 24 * 60 * 60_000);
    const windowEnd = new Date();

    for (const u of digestUsers) {
      if (!u.emailVerified || u.emailOptOut || u.email.endsWith('.placeholder')) continue;

      const notifRows = await this.db
        .select({
          surveyId: sql<string>`(metadata->>'surveyId')::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, u.userId),
            eq(notifications.type, 'new_response'),
            gte(notifications.createdAt, windowStart),
            lt(notifications.createdAt, windowEnd),
          ),
        )
        .groupBy(sql`metadata->>'surveyId'`);

      if (notifRows.length === 0) continue;

      const digestItems: Array<{ surveyTitle: string; newCount: number; totalCount: number; targetCount: number }> = [];
      for (const row of notifRows) {
        if (!row.surveyId) continue;
        const surveyRows = await this.db
          .select({ title: surveys.title, completedCount: surveys.completedCount, targetCount: surveys.targetCount })
          .from(surveys)
          .where(eq(surveys.id, row.surveyId))
          .limit(1);
        if (!surveyRows[0]) continue;
        digestItems.push({
          surveyTitle: surveyRows[0].title,
          newCount: row.count,
          totalCount: surveyRows[0].completedCount,
          targetCount: surveyRows[0].targetCount,
        });
      }

      if (digestItems.length === 0) continue;

      void this.mail
        .sendDailyDigestEmail(u.email, u.displayName, digestItems)
        .catch((err: unknown) =>
          this.logger.error(`daily digest email failed for userId=${u.userId}`, err),
        );
    }

    this.logger.log(`daily digest cron finished, processed ${digestUsers.length} surveyor(s)`);
  }

  // ─── QUA-200: 受試者感謝 email ──────────────────────────────────────────────

  async sendRespondentThankYou(
    respondentId: string,
    surveyTitle: string,
    rewardPoints: number,
  ): Promise<void> {
    const rows = await this.db
      .select({
        email: users.email,
        displayName: users.displayName,
        emailVerified: users.emailVerified,
        emailOptOut: users.emailOptOut,
      })
      .from(users)
      .where(eq(users.id, respondentId))
      .limit(1);

    const user = rows[0];
    if (!user || !user.emailVerified || user.emailOptOut) return;
    if (user.email.endsWith('.placeholder')) return;

    void this.mail
      .sendRespondentThankYouEmail(user.email, user.displayName, surveyTitle, rewardPoints)
      .catch((err: unknown) =>
        this.logger.error(`thank-you email failed for respondentId=${respondentId}`, err),
      );
  }

  // ─── 查詢使用者通知 ──────────────────────────────────────────────────────────

  async findByUser(userId: string) {
    return this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async countUnread(userId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return rows[0]?.count ?? 0;
  }

  // ─── 標記已讀 ────────────────────────────────────────────────────────────────

  async markRead(notificationId: string, userId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  // ─── QUA-201: Auto-close notification ────────────────────────────────────

  async sendSurveyAutoCloseNotification(
    surveyorId: string,
    surveyId: string,
    title: string,
    reason: string,
  ): Promise<void> {
    await this.create({
      userId: surveyorId,
      type: 'system',
      title: '問卷已自動截止',
      body: `您的問卷「${title}」已自動截止，原因：${reason}`,
      metadata: { surveyId, reason },
    });

    const [user] = await this.db
      .select({
        email: users.email,
        displayName: users.displayName,
        emailVerified: users.emailVerified,
        emailOptOut: users.emailOptOut,
      })
      .from(users)
      .where(eq(users.id, surveyorId))
      .limit(1);

    if (user?.emailVerified && !user?.emailOptOut) {
      await this.mail.sendNotificationEmail(
        user.email,
        user.displayName,
        '問卷已自動截止',
        `您的問卷「${title}」已自動截止，原因：${reason}`,
      );
    }
  }
}
