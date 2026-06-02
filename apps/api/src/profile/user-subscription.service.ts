import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { journalEntries, transactions, users, wallets } from '../db/schema';
import { AiUsageService } from '../common/ai-usage.service';
import { WalletService } from '../wallet/wallet.service';

export type SubscriptionPlan = 'free' | 'vip' | 'vvip';

const PLAN_CONFIG = {
  free: {
    id: 'free' as const,
    name: 'Free',
    priceMonthly: 0,
    dailyAiLimit: 3,
    badge: '目前方案',
    cta: '已啟用',
  },
  vip: {
    id: 'vip' as const,
    name: 'VIP',
    priceMonthly: 890,
    dailyAiLimit: 50,
    badge: '熱門',
    cta: '升級 VIP',
  },
  vvip: {
    id: 'vvip' as const,
    name: 'VVIP',
    priceMonthly: 1990,
    dailyAiLimit: null,
    badge: '專業',
    cta: '升級 VVIP',
  },
};

const SUBSCRIPTION_REDEMPTION = {
  targetPlan: 'vip' as const,
  costPoints: 500,
  durationDays: 7,
};

@Injectable()
export class UserSubscriptionService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly aiUsageService: AiUsageService,
    private readonly walletService: WalletService,
  ) {}

  async getSubscription(userId: string) {
    const [user, usage, wallet] = await Promise.all([
      this.db
        .select({ tier: users.tier })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .then((rows) => rows[0]),
      this.aiUsageService.getTodayUsage(userId),
      this.walletService.getWallet(userId),
    ]);

    if (!user) {
      throw new BadRequestException('找不到使用者');
    }

    const aggregateLimit = this.planAggregateLimit(user.tier);
    const aggregateUsed =
      usage.used.optimizeSurvey +
      usage.used.generateQuestions +
      usage.used.analyzeResponses;

    return {
      currentPlan: user.tier,
      plans: Object.values(PLAN_CONFIG),
      usage: {
        todayUsed: aggregateUsed,
        todayLimit: aggregateLimit,
        display: aggregateLimit === null ? `${aggregateUsed}/∞` : `${aggregateUsed}/${aggregateLimit}`,
      },
      features: usage,
      wallet: {
        pointsBalance: wallet?.pointsBalance ?? 0,
      },
      redemption: {
        ...SUBSCRIPTION_REDEMPTION,
        affordable: (wallet?.pointsBalance ?? 0) >= SUBSCRIPTION_REDEMPTION.costPoints,
      },
    };
  }

  async subscribe(userId: string, plan: Exclude<SubscriptionPlan, 'free'>) {
    const config = PLAN_CONFIG[plan];
    if (!config || config.priceMonthly <= 0) {
      throw new BadRequestException('無效的訂閱方案');
    }

    const html = await this.walletService.createEcpayOrder(userId, config.priceMonthly);

    return {
      plan,
      amount: config.priceMonthly,
      html,
      message: `已建立 ${config.name} 訂閱付款單`,
    };
  }

  async redeem(userId: string) {
    const wallet = await this.walletService.ensureWallet(userId);
    if (wallet.pointsBalance < SUBSCRIPTION_REDEMPTION.costPoints) {
      throw new BadRequestException(
        `積分不足，需要 ${SUBSCRIPTION_REDEMPTION.costPoints} 點，目前 ${wallet.pointsBalance} 點`,
      );
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      const updatedWallet = await tx
        .update(wallets)
        .set({
          pointsBalance: sql`points_balance - ${SUBSCRIPTION_REDEMPTION.costPoints}`,
          version: sql`version + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(wallets.userId, userId),
            sql`points_balance >= ${SUBSCRIPTION_REDEMPTION.costPoints}`,
          ),
        )
        .returning({ id: wallets.id });

      if (updatedWallet.length === 0) {
        throw new BadRequestException('積分扣除失敗，請重新整理後再試');
      }

      await tx
        .update(users)
        .set({
          tier: SUBSCRIPTION_REDEMPTION.targetPlan,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      const [txn] = await tx
        .insert(transactions)
        .values({
          userId,
          type: 'points_spend',
          amount: SUBSCRIPTION_REDEMPTION.costPoints,
          status: 'success',
          note: `積分兌換 ${SUBSCRIPTION_REDEMPTION.durationDays} 天 VIP`,
          metadata: {
            subscriptionPlan: SUBSCRIPTION_REDEMPTION.targetPlan,
            durationDays: SUBSCRIPTION_REDEMPTION.durationDays,
          },
          completedAt: now,
        })
        .returning({ id: transactions.id });

      await tx.insert(journalEntries).values([
        {
          transactionId: txn.id,
          accountName: `points_wallet_${userId}`,
          debitAmount: SUBSCRIPTION_REDEMPTION.costPoints,
          creditAmount: 0,
        },
        {
          transactionId: txn.id,
          accountName: 'points_subscription_revenue',
          debitAmount: 0,
          creditAmount: SUBSCRIPTION_REDEMPTION.costPoints,
        },
      ]);
    });

    return {
      plan: SUBSCRIPTION_REDEMPTION.targetPlan,
      message: `已兌換 ${SUBSCRIPTION_REDEMPTION.durationDays} 天 VIP`,
    };
  }

  private planAggregateLimit(plan: SubscriptionPlan): number | null {
    switch (plan) {
      case 'free':
        return 3;
      case 'vip':
        return 50;
      case 'vvip':
        return null;
    }
  }
}