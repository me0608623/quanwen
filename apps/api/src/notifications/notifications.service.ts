import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, sql, gte, lt } from 'drizzle-orm';
import { Cron } from '@nestjs/schedule';
import { DB } from '../db';
import type { AppDb } from '../db';
import { notifications, users, surveyorProfiles, surveys } from '../db/schema';
import type { NewNotification } from '../db/schema';
import { MailService } from '../mail/mail.service';

// 哪些 type 要 email 推播（routine 動作如 reward_issued 不寄、避免疲勞）
const EMAIL_TYPES = new Set<NewNotification['type']>([
  'survey_approved',
  'survey_rejected',
  'new_response',   // QUA-203: 問券方收到新填答時寄 email 通知
  'system', // 申訴結果、KYC 結果、停權等都是 system
]);

// QUA-203: new_response email 節流 — 同一用戶每 N 分鐘最多寄一封，避免高流量問券方被淹沒
const NEW_RESPONSE_EMAIL_COOLDOWN_MINUTES = 15;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly mail: MailService,
  ) {}

  // ─── 建立通知（供其他 service 呼叫）──────────────────────────────────────────

  async create(dto: Omit<NewNotification, 'id' | 'isRead' | 'createdAt'>) {
    await this.db.insert(notifications).values({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      metadata: dto.metadata,
    });

    // Phase F.1: fire-and-forget 寄 email（僅特定 type + 用戶 email_verified）
    if (EMAIL_TYPES.has(dto.type)) {
      const metadata = dto.metadata as Record<string, unknown> | undefined;
      void this.sendEmailNotification(dto.userId, dto.title, dto.body ?? '', dto.type, metadata).catch((err) =>
        this.logger.error(`通知 email 寄送失敗 userId=${dto.userId}`, err),
      );
    }
  }

  /**
   * QUA-203: 檢查 new_response 是否在冷卻期內（避免 email 疲勞轟炸）。
   * 同一用戶在 cooldown window 內只收到一封 new_response email，
   * 後續填答仍建立 in-app 通知但不寄信。
   */
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
    // count > 1 代表冷卻期內已有至少一條 new_response 通知（含剛 insert 的這條）
    return (rows[0]?.count ?? 0) > 1;
  }

  private async sendEmailNotification(
    userId: string,
    title: string,
    body: string,
    type: NewNotification['type'],
    metadata?: Record<string, unknown>,
  ) {
    // QUA-200: new_response email — skip if creator prefers daily digest
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

      // QUA-203: 節流 new_response email（冷卻期內跳過寄信）
      const throttled = await this.isNewResponseEmailThrottled(userId);
      if (throttled) {
        this.logger.debug(`new_response email throttled for userId=${userId} (cooldown=${NEW_RESPONSE_EMAIL_COOLDOWN_MINUTES}min)`);
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
    // QUA-200: respect opt-out preference
    if (user.emailOptOut) return;
    // 跳過 placeholder email（OAuth 未填 email 時 fallback 用的格式）
    if (user.email.endsWith('.placeholder')) return;

    await this.mail.sendNotificationEmail(user.email, user.displayName, title, body);
  }

  // ─── QUA-200: 每日填答摘要（每天 08:00 台北時間 = 00:00 UTC）────────────────

  @Cron('0 0 * * *', { timeZone: 'Asia/Taipei' })
  async sendDailyDigests(): Promise<void> {
    this.logger.log('daily digest cron started');

    // 找出所有偏好 daily_digest 且 email 有效的問券方
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

      // 找出該用戶在 24h 內的 new_response 通知，依問卷聚合
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

      // 取得問卷標題與累計數
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
      .where(
        and(eq(notifications.id, notificationId), eq(notifications.userId, userId)),
      );
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

    // Also attempt email
    const [user] = await this.db
      .select({ email: users.email, displayName: users.displayName, emailVerified: users.emailVerified, emailOptOut: users.emailOptOut })
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
