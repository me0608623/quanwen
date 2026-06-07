import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  users,
  oauthAccounts,
  wallets,
  transactions,
  surveys,
  surveyResponses,
  respondentProfiles,
  responseAppeals,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

export interface AdminUserSearchParams {
  q?: string;
  status?: 'active' | 'suspended' | 'pending_verify';
  page: number;
  limit: number;
}

export type UserTier = 'free' | 'vip' | 'vvip';

const TIER_LABELS: Record<UserTier, string> = {
  free: 'Free',
  vip: 'VIP',
  vvip: 'VVIP',
};

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── 使用者搜尋（分頁）────────────────────────────────────────────────────

  async searchUsers(params: AdminUserSearchParams) {
    const { q, status, page, limit } = params;

    const conditions = [isNull(users.deletedAt)];
    if (status) conditions.push(eq(users.status, status));
    if (q && q.trim()) {
      const pattern = `%${q.trim()}%`;
      conditions.push(or(ilike(users.email, pattern), ilike(users.displayName, pattern))!);
    }
    const where = and(...conditions);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(where);

    const items = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        tier: users.tier,
        status: users.status,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        cashBalance: sql<number>`coalesce(${wallets.cashBalance}, 0)`,
        pointsBalance: sql<number>`coalesce(${wallets.pointsBalance}, 0)`,
        surveyCount: sql<number>`(select count(*)::int from ${surveys} where ${surveys.surveyorId} = ${users.id})`,
        responseCount: sql<number>`(select count(*)::int from ${surveyResponses} where ${surveyResponses.respondentId} = ${users.id})`,
      })
      .from(users)
      .leftJoin(wallets, eq(wallets.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return { items, total, page, limit };
  }

  // ─── 使用者詳情 ───────────────────────────────────────────────────────────

  async getUserDetail(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        tier: users.tier,
        status: users.status,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) throw new NotFoundException('使用者不存在');

    const [oauthRows, walletRows, profileRows, stats, txRows, respRows] = await Promise.all([
      this.db
        .select({ provider: oauthAccounts.provider })
        .from(oauthAccounts)
        .where(eq(oauthAccounts.userId, userId)),
      this.db
        .select({
          cashBalance: wallets.cashBalance,
          lockedCash: wallets.lockedCash,
          pointsBalance: wallets.pointsBalance,
        })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1),
      this.db
        .select({ reputationScore: respondentProfiles.reputationScore })
        .from(respondentProfiles)
        .where(eq(respondentProfiles.userId, userId))
        .limit(1),
      this.getUserStats(userId),
      this.db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          status: transactions.status,
          note: transactions.note,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(desc(transactions.createdAt))
        .limit(20),
      this.db
        .select({
          id: surveyResponses.id,
          surveyId: surveyResponses.surveyId,
          surveyTitle: surveys.title,
          status: surveyResponses.status,
          qualityScore: surveyResponses.qualityScore,
          submittedAt: surveyResponses.submittedAt,
        })
        .from(surveyResponses)
        .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
        .where(eq(surveyResponses.respondentId, userId))
        .orderBy(desc(surveyResponses.startedAt))
        .limit(10),
    ]);

    return {
      user,
      oauthProviders: oauthRows.map((r) => r.provider),
      wallet: walletRows[0] ?? null,
      reputationScore: profileRows[0]?.reputationScore ?? null,
      stats,
      recentTransactions: txRows,
      recentResponses: respRows,
    };
  }

  /** 四個統計子查詢，全部走 Drizzle 參數化（route param 不可進 sql.raw） */
  private async getUserStats(userId: string) {
    const [surveyRows, responseRows, approvedRows, appealRows] = await Promise.all([
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(surveys)
        .where(eq(surveys.surveyorId, userId)),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .where(eq(surveyResponses.respondentId, userId)),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(surveyResponses)
        .where(and(eq(surveyResponses.respondentId, userId), eq(surveyResponses.status, 'rewarded'))),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(responseAppeals)
        .where(eq(responseAppeals.respondentId, userId)),
    ]);
    return {
      surveyCount: surveyRows[0]?.n ?? 0,
      responseCount: responseRows[0]?.n ?? 0,
      approvedResponseCount: approvedRows[0]?.n ?? 0,
      appealCount: appealRows[0]?.n ?? 0,
    };
  }

  // ─── VIP 等級調整 ────────────────────────────────────────────────────────

  async updateUserTier(adminId: string, userId: string, tier: UserTier) {
    const [target] = await this.db
      .select({ id: users.id, tier: users.tier })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!target) throw new NotFoundException('使用者不存在');
    if (target.tier === tier) throw new ConflictException('使用者已是此 VIP 等級');

    const [updated] = await this.db
      .update(users)
      .set({ tier, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tier, target.tier), isNull(users.deletedAt)))
      .returning({ id: users.id, tier: users.tier });

    if (!updated) throw new ConflictException('使用者 VIP 等級已被其他操作更新，請重新整理後再試');

    this.logger.log(`Admin ${adminId} updated user ${userId} tier: ${target.tier} -> ${tier}`);

    try {
      await this.notifications.create({
        userId,
        type: 'system',
        title: 'VIP 等級已更新',
        body: `您的會員等級已由管理員調整為 ${TIER_LABELS[tier]}。`,
        metadata: {
          adminAction: 'update_tier',
          adminId,
          previousTier: target.tier,
          tier,
        },
      });
    } catch (err) {
      this.logger.warn(`Tier update notification failed for ${userId}: ${err}`);
    }

    return { id: userId, tier: updated.tier, previousTier: target.tier };
  }

  // ─── 停權 / 復權 ─────────────────────────────────────────────────────────

  async suspendUser(adminId: string, userId: string, reason: string) {
    if (adminId === userId) throw new BadRequestException('不可停權自己的帳號');

    const [target] = await this.db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!target) throw new NotFoundException('使用者不存在');
    if (target.role === 'admin') throw new ForbiddenException('不可停權管理員帳號');
    if (target.status === 'suspended') throw new ConflictException('此帳號已是停權狀態');

    // 原子條件更新：併發下只有一個 admin 的停權會生效
    const updated = await this.db
      .update(users)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(and(eq(users.id, userId), sql`${users.status} != 'suspended'`))
      .returning({ id: users.id });
    if (updated.length === 0) throw new ConflictException('此帳號已是停權狀態');

    this.logger.warn(`Admin ${adminId} suspended user ${userId}: ${reason}`);

    // 通知留底（用戶停權期間登不進來，但復權後可見紀錄）；失敗不影響停權本身
    try {
      await this.notifications.create({
        userId,
        type: 'system',
        title: '帳號已被停權',
        body: `您的帳號因「${reason}」已被停權。如有疑問請聯繫客服申訴。`,
        metadata: { adminAction: 'suspend', adminId },
      });
    } catch (err) {
      this.logger.warn(`Suspend notification failed for ${userId}: ${err}`);
    }

    return { id: userId, status: 'suspended' as const };
  }

  async unsuspendUser(adminId: string, userId: string) {
    const [target] = await this.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!target) throw new NotFoundException('使用者不存在');
    if (target.status !== 'suspended') throw new ConflictException('此帳號不是停權狀態');

    await this.db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.status, 'suspended')));

    this.logger.log(`Admin ${adminId} unsuspended user ${userId}`);

    try {
      await this.notifications.create({
        userId,
        type: 'system',
        title: '帳號已恢復使用',
        body: '您的帳號已由管理員恢復為正常狀態，現在可以正常登入使用。',
        metadata: { adminAction: 'unsuspend', adminId },
      });
    } catch (err) {
      this.logger.warn(`Unsuspend notification failed for ${userId}: ${err}`);
    }

    return { id: userId, status: 'active' as const };
  }
}
