import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { notifications, users } from '../db/schema';
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
    // QUA-203: 節流 new_response email（冷卻期內跳過寄信）
    if (type === 'new_response') {
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
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user || !user.emailVerified) return;
    // 跳過 placeholder email（OAuth 未填 email 時 fallback 用的格式）
    if (user.email.endsWith('.placeholder')) return;

    await this.mail.sendNotificationEmail(user.email, user.displayName, title, body);
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
}
