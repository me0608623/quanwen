import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  wallets,
  transactions,
  journalEntries,
  surveys,
} from '../db/schema';

const POINTS_VALUE_NTD = 0.5; // 1 積分 = NT$0.5（顯示用）
import { NotificationsService } from '../notifications/notifications.service';
import { EcpayService } from './ecpay.service';
import { CryptoService } from '../common/crypto.service';
import { KycService } from '../kyc/kyc.service';

const PLATFORM_FEE_RATE = 0.15; // 15% 手續費
const MIN_WITHDRAWAL = 300;
const MAX_DAILY_WITHDRAWAL = 30_000;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly ecpay: EcpayService,
    private readonly crypto: CryptoService,
    @Inject(forwardRef(() => KycService))
    private readonly kyc: KycService,
  ) {}

  // ─── 取得（或建立）錢包 ───────────────────────────────────────────────────

  async ensureWallet(userId: string) {
    const rows = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (rows[0]) return rows[0];

    const [created] = await this.db
      .insert(wallets)
      .values({ userId })
      .returning();
    return created;
  }

  async getWallet(userId: string) {
    await this.ensureWallet(userId);
    const rows = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  // ─── 交易紀錄 ──────────────────────────────────────────────────────────────

  async getTransactions(userId: string, limit = 50) {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  // ─── ECPay 儲值 ───────────────────────────────────────────────────────────

  async createEcpayOrder(userId: string, amount: number): Promise<string> {
    if (amount < 100 || amount > 100_000) {
      throw new BadRequestException('儲值金額需在 NT$100～NT$100,000 之間');
    }
    await this.ensureWallet(userId);

    // Create a pending deposit transaction — MerchantTradeNo = txn ID prefix (max 20 chars)
    const [txn] = await this.db
      .insert(transactions)
      .values({
        userId,
        type: 'deposit',
        amount,
        status: 'pending',
        note: `ECPay 儲值 NT$${amount}（待付款）`,
      })
      .returning();

    // MerchantTradeNo: 'QW' + txn.id first 18 chars (UUID without dashes, max 20)
    const tradeNo = ('QW' + txn.id.replace(/-/g, '')).slice(0, 20);

    // Phase A: 寫到 external_provider + external_ref（DB 有 UNIQUE 約束，做為強 idempotency key）
    await this.db
      .update(transactions)
      .set({
        externalProvider: 'ecpay',
        externalRef: tradeNo,
        metadata: { ecpayTradeNo: tradeNo },
      })
      .where(eq(transactions.id, txn.id));

    const apiUrl = process.env.API_URL ?? 'http://localhost:3001';
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';

    const html = this.ecpay.buildPaymentForm({
      merchantTradeNo: tradeNo,
      amount,
      itemName: `券問平台儲值 NT$${amount}`,
      returnUrl: `${apiUrl}/api/v1/wallet/ecpay/callback`,
      clientBackUrl: `${webUrl}/wallet?deposit=done`,
    });

    this.logger.log(`ECPay order created: user=${userId} amount=${amount} tradeNo=${tradeNo}`);
    return html;
  }

  async processEcpayCallback(body: Record<string, string>): Promise<string> {
    const result = this.ecpay.parseCallback(body);

    if (!result.valid) {
      this.logger.warn(`ECPay callback invalid CheckMacValue: tradeNo=${result.merchantTradeNo}`);
      return '0|ErrorCheckMacValue';
    }

    // Phase A: 用 (external_provider, external_ref) 直接 lookup，UNIQUE 約束保證 idempotency
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.externalProvider, 'ecpay'),
        eq(transactions.externalRef, result.merchantTradeNo),
      ))
      .limit(1);
    const txn = rows[0];

    if (!txn) {
      this.logger.warn(`ECPay callback: transaction not found for tradeNo=${result.merchantTradeNo}`);
      return '1|OK'; // Idempotent — already processed or unknown
    }

    if (['success', 'failed', 'cancelled'].includes(txn.status as string)) {
      this.logger.log(`ECPay callback: txn ${txn.id} already ${txn.status}, treating as duplicate`);
      return '1|OK';
    }

    if (result.rtnCode !== '1') {
      // Payment failed
      await this.db
        .update(transactions)
        .set({ status: 'failed', note: `ECPay 付款失敗：${result.rtnMsg}`, completedAt: new Date() })
        .where(eq(transactions.id, txn.id));
      this.logger.log(`ECPay payment failed: tradeNo=${result.merchantTradeNo} msg=${result.rtnMsg}`);
      return '1|OK';
    }

    // Payment succeeded — credit wallet
    const now = new Date();
    await this.db
      .update(transactions)
      .set({
        status: 'success',
        note: `ECPay 儲值完成 NT$${txn.amount}（TradeNo: ${result.tradeNo}）`,
        completedAt: now,
        metadata: { ecpayTradeNo: result.merchantTradeNo, ecpayServerTradeNo: result.tradeNo },
      })
      .where(eq(transactions.id, txn.id));

    await this.db.insert(journalEntries).values([
      { transactionId: txn.id, accountName: 'escrow_ecpay', debitAmount: txn.amount, creditAmount: 0 },
      { transactionId: txn.id, accountName: `wallet_${txn.userId}`, debitAmount: 0, creditAmount: txn.amount },
    ]);

    await this.db
      .update(wallets)
      .set({
        cashBalance: sql`cash_balance + ${txn.amount}`,
        version: sql`version + 1`,
        updatedAt: now,
      })
      .where(eq(wallets.userId, txn.userId));

    this.logger.log(`ECPay payment success: user=${txn.userId} amount=${txn.amount} tradeNo=${result.merchantTradeNo}`);
    return '1|OK';
  }

  // ─── Mock 儲值（正式環境替換為 ECPay 下單 + webhook） ─────────────────────

  async mockDeposit(userId: string, amount: number): Promise<void> {
    await this.ensureWallet(userId);

    // 建立 transaction 紀錄
    const [txn] = await this.db
      .insert(transactions)
      .values({
        userId,
        type: 'deposit',
        amount,
        status: 'success',
        note: 'Mock 儲值（開發用）',
        completedAt: new Date(),
      })
      .returning();

    // 複式記帳分錄：DR escrow_mock / CR surveyor_wallet
    await this.db.insert(journalEntries).values([
      { transactionId: txn.id, accountName: 'escrow_mock', debitAmount: amount, creditAmount: 0 },
      { transactionId: txn.id, accountName: `wallet_${userId}`, debitAmount: 0, creditAmount: amount },
    ]);

    // 更新錢包餘額
    await this.db
      .update(wallets)
      .set({
        cashBalance: sql`cash_balance + ${amount}`,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    this.logger.log(`Mock deposit: user=${userId} amount=${amount}`);
  }

  // ─── 發放獎勵（填答提交後自動觸發） ───────────────────────────────────────
  // 問券方 → 受試者 + 平台手續費
  // 若問券方餘額不足，改為 pending 狀態，等待人工處理

  async issueReward(params: {
    surveyId: string;
    responseId: string;
    respondentId: string;
    surveyorId: string;
    rewardAmount: number; // 受試者獲得金額
  }): Promise<void> {
    const { surveyId, responseId, respondentId, surveyorId, rewardAmount } = params;

    if (rewardAmount <= 0) return;

    const platformFee = Math.ceil(rewardAmount * PLATFORM_FEE_RATE);
    const totalDeduct = rewardAmount + platformFee;

    await this.ensureWallet(surveyorId);
    await this.ensureWallet(respondentId);

    const now = new Date();

    // ── 先原子扣款：guarded UPDATE 是唯一真相來源 ──────────────────────────────
    // 若問券方餘額不足（或並發造成餘額已低於門檻），UPDATE 影響 0 行 → pending
    const deducted = await this.db
      .update(wallets)
      .set({
        cashBalance: sql`cash_balance - ${totalDeduct}`,
        version: sql`version + 1`,
        updatedAt: now,
      })
      .where(and(eq(wallets.userId, surveyorId), sql`cash_balance >= ${totalDeduct}`))
      .returning({ id: wallets.id });

    const txStatus = deducted.length > 0 ? 'success' : 'pending';

    // ── 建立三筆 transaction（狀態由實際扣款結果決定）────────────────────────
    const [rewardOutTxn] = await this.db
      .insert(transactions)
      .values({
        userId: surveyorId,
        type: 'reward_out',
        amount: totalDeduct,
        status: txStatus,
        relatedSurveyId: surveyId,
        relatedResponseId: responseId,
        note: `問券方支付獎勵 NT$${rewardAmount} + 手續費 NT$${platformFee}`,
        completedAt: txStatus === 'success' ? now : null,
      })
      .returning();

    const [rewardInTxn] = await this.db
      .insert(transactions)
      .values({
        userId: respondentId,
        type: 'reward_in',
        amount: rewardAmount,
        status: txStatus,
        relatedSurveyId: surveyId,
        relatedResponseId: responseId,
        note: `完成問卷獲得獎勵 NT$${rewardAmount}`,
        completedAt: txStatus === 'success' ? now : null,
      })
      .returning();

    const [feeTxn] = await this.db
      .insert(transactions)
      .values({
        userId: surveyorId,
        type: 'platform_fee',
        amount: platformFee,
        status: txStatus,
        relatedSurveyId: surveyId,
        relatedResponseId: responseId,
        note: `平台手續費 15%`,
        completedAt: txStatus === 'success' ? now : null,
      })
      .returning();

    // ── 複式記帳分錄 ────────────────────────────────────────────────────────
    await this.db.insert(journalEntries).values([
      { transactionId: rewardOutTxn.id, accountName: `wallet_${surveyorId}`, debitAmount: totalDeduct, creditAmount: 0 },
      { transactionId: rewardOutTxn.id, accountName: 'reward_payable', debitAmount: 0, creditAmount: totalDeduct },
      { transactionId: rewardInTxn.id, accountName: 'reward_payable', debitAmount: rewardAmount, creditAmount: 0 },
      { transactionId: rewardInTxn.id, accountName: `wallet_${respondentId}`, debitAmount: 0, creditAmount: rewardAmount },
      { transactionId: feeTxn.id, accountName: 'reward_payable', debitAmount: platformFee, creditAmount: 0 },
      { transactionId: feeTxn.id, accountName: 'platform_revenue', debitAmount: 0, creditAmount: platformFee },
    ]);

    if (txStatus === 'success') {
      // 受試者入帳
      await this.db
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance + ${rewardAmount}`,
          version: sql`version + 1`,
          updatedAt: now,
        })
        .where(eq(wallets.userId, respondentId));
    }

    this.logger.log(
      `Reward issued: survey=${surveyId} response=${responseId} amount=${rewardAmount} fee=${platformFee} status=${txStatus}`,
    );

    if (txStatus === 'success') {
      this.notifications
        .create({
          userId: respondentId,
          type: 'reward_issued',
          title: `獎勵 NT$${rewardAmount} 已入帳`,
          body: '感謝你完成問卷填答，獎勵已發放至你的錢包。',
          metadata: { surveyId, responseId, amount: rewardAmount },
        })
        .catch((err: unknown) =>
          this.logger.error(`reward_issued 通知失敗 responseId=${responseId}`, err),
        );
    }
  }

  // ─── 申請提領 ─────────────────────────────────────────────────────────────

  async requestWithdrawal(
    userId: string,
    amount: number,
    bankInfo: { bankCode: string; bankAccount: string; accountName: string },
  ): Promise<{ transactionId: string }> {
    if (amount < MIN_WITHDRAWAL) {
      throw new BadRequestException(`最低提領金額為 NT$${MIN_WITHDRAWAL}`);
    }

    // Phase B: 提領 ≥ NT$2,000 需先通過 KYC
    await this.kyc.assertKycForWithdrawal(userId, amount);

    const wallet = await this.getWallet(userId);
    if (!wallet) throw new NotFoundException('找不到錢包');

    if (wallet.cashBalance < amount) {
      throw new BadRequestException('餘額不足');
    }

    // 每日提領上限
    const todayTotal = await this.db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, 'withdraw_request'),
          sql`created_at >= NOW() - interval '1 day'`,
        ),
      );

    const usedToday = Number(todayTotal[0]?.total ?? 0);
    if (usedToday + amount > MAX_DAILY_WITHDRAWAL) {
      throw new BadRequestException(`每日提領上限 NT$${MAX_DAILY_WITHDRAWAL}，今日已申請 NT$${usedToday}`);
    }

    // Phase K.2: 用 db.transaction 把 INSERT txn + UPDATE wallets 包成原子操作，
    // 避免併發提領導致 TOCTOU 雙重扣款（之前是 read-then-write，兩 request 都可能過 balance check）
    const txnId = await this.db.transaction(async (tx) => {
      // 在 transaction 內重新驗 balance 並更新（cash_balance >= amount 是 atomic guard）
      const updateResult = await tx
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance - ${amount}`,
          lockedCash: sql`locked_cash + ${amount}`,
          version: sql`version + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.userId, userId), sql`cash_balance >= ${amount}`))
        .returning({ id: wallets.id });

      if (updateResult.length === 0) {
        // 餘額已被別的併發 request 扣掉
        throw new BadRequestException('餘額不足（可能有其他提領正在處理）');
      }

      const [txn] = await tx
        .insert(transactions)
        .values({
          userId,
          type: 'withdraw_request',
          amount,
          status: 'pending',
          note: '提領申請（待撥款）',
          metadata: {
            bankCode: bankInfo.bankCode,
            bankAccountMasked: maskBankAccount(bankInfo.bankAccount),
            accountNameMasked: maskName(bankInfo.accountName),
            bankAccountCipher: this.crypto.encrypt(bankInfo.bankAccount),
            accountNameCipher: this.crypto.encrypt(bankInfo.accountName),
          },
        })
        .returning({ id: transactions.id });
      return txn.id;
    });

    this.logger.log(`Withdrawal requested: user=${userId} amount=${amount} txn=${txnId}`);
    return { transactionId: txnId };
  }

  // ─── 查詢問卷預算是否足夠（發布問卷前檢查） ──────────────────────────────

  async checkSurveyBudget(surveyorId: string, surveyId: string): Promise<{
    sufficient: boolean;
    walletBalance: number;
    requiredAmount: number;
  }> {
    const wallet = await this.getWallet(surveyorId);
    const surveyRows = await this.db
      .select({ rewardPoints: surveys.rewardPoints, targetCount: surveys.targetCount })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey) throw new NotFoundException('找不到問卷');

    const requiredAmount = survey.rewardPoints * survey.targetCount;
    const walletBalance = wallet?.cashBalance ?? 0;

    return {
      sufficient: walletBalance >= requiredAmount,
      walletBalance,
      requiredAmount,
    };
  }

  // ─── 受試者收益摘要 ───────────────────────────────────────────────────────

  async getEarningsSummary(userId: string) {
    const allRewards = await this.db
      .select({
        amount: transactions.amount,
        status: transactions.status,
        relatedSurveyId: transactions.relatedSurveyId,
        completedAt: transactions.completedAt,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, 'reward_in')))
      .orderBy(desc(transactions.createdAt));

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalEarned = 0;
    let pendingRewards = 0;
    let thisMonth = 0;
    const bySurveyMap = new Map<string, number>();

    for (const r of allRewards) {
      if (r.status === 'success') {
        totalEarned += r.amount;
        const completedDate = r.completedAt ? new Date(r.completedAt) : null;
        if (completedDate && completedDate >= firstDayOfMonth) {
          thisMonth += r.amount;
        }
        if (r.relatedSurveyId) {
          bySurveyMap.set(r.relatedSurveyId, (bySurveyMap.get(r.relatedSurveyId) ?? 0) + r.amount);
        }
      } else if (r.status === 'pending') {
        pendingRewards += r.amount;
      }
    }

    // 取問卷標題
    const surveyIds = [...bySurveyMap.keys()];
    const surveyTitles =
      surveyIds.length > 0
        ? await this.db
            .select({ id: surveys.id, title: surveys.title })
            .from(surveys)
            .where(inArray(surveys.id, surveyIds))
        : [];

    const titleMap = new Map(surveyTitles.map((s) => [s.id, s.title]));

    const bySurvey = [...bySurveyMap.entries()]
      .map(([surveyId, amount]) => ({
        surveyId,
        surveyTitle: titleMap.get(surveyId) ?? '已刪除問卷',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // 近 3 個月月收益
    const monthlyMap = new Map<string, number>();
    for (const r of allRewards) {
      if (r.status !== 'success') continue;
      const d = r.completedAt ?? r.createdAt;
      if (!d) continue;
      const monthKey = new Date(d).toISOString().slice(0, 7); // YYYY-MM
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + r.amount);
    }
    const monthly = [...monthlyMap.entries()]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 6);

    return { totalEarned, pendingRewards, thisMonth, bySurvey, monthly };
  }

  // ─── 通用積分發放（轉盤、活動獎勵等，與 survey 無關）──────────────────────

  async grantPoints(userId: string, pointsAmount: number, note: string): Promise<void> {
    if (pointsAmount <= 0) return;
    await this.ensureWallet(userId);
    const now = new Date();

    const [txn] = await this.db
      .insert(transactions)
      .values({
        userId,
        type: 'points_in',
        amount: pointsAmount,
        status: 'success',
        note,
        completedAt: now,
      })
      .returning();

    await this.db.insert(journalEntries).values([
      { transactionId: txn.id, accountName: 'points_liability', debitAmount: pointsAmount, creditAmount: 0 },
      { transactionId: txn.id, accountName: `points_wallet_${userId}`, debitAmount: 0, creditAmount: pointsAmount },
    ]);

    await this.db
      .update(wallets)
      .set({
        pointsBalance: sql`points_balance + ${pointsAmount}`,
        version: sql`version + 1`,
        updatedAt: now,
      })
      .where(eq(wallets.userId, userId));

    this.logger.log(`Bonus points granted: user=${userId.slice(0, 8)} points=${pointsAmount} (${note})`);
  }

  // ─── 發放積分（受試者完成積分類型問卷時呼叫）─────────────────────────────

  async issuePoints(params: {
    surveyId: string;
    responseId: string;
    respondentId: string;
    pointsAmount: number;
  }): Promise<void> {
    const { surveyId, responseId, respondentId, pointsAmount } = params;
    if (pointsAmount <= 0) return;

    await this.ensureWallet(respondentId);
    const now = new Date();

    const [txn] = await this.db
      .insert(transactions)
      .values({
        userId: respondentId,
        type: 'points_in',
        amount: pointsAmount,
        status: 'success',
        relatedSurveyId: surveyId,
        relatedResponseId: responseId,
        note: `完成問卷獲得 ${pointsAmount} 積分`,
        completedAt: now,
      })
      .returning();

    await this.db.insert(journalEntries).values([
      { transactionId: txn.id, accountName: 'points_liability', debitAmount: pointsAmount, creditAmount: 0 },
      { transactionId: txn.id, accountName: `points_wallet_${respondentId}`, debitAmount: 0, creditAmount: pointsAmount },
    ]);

    await this.db
      .update(wallets)
      .set({
        pointsBalance: sql`points_balance + ${pointsAmount}`,
        version: sql`version + 1`,
        updatedAt: now,
      })
      .where(eq(wallets.userId, respondentId));

    this.logger.log(`Points issued: survey=${surveyId} response=${responseId} points=${pointsAmount}`);

    this.notifications
      .create({
        userId: respondentId,
        type: 'reward_issued',
        title: `獲得 ${pointsAmount} 積分`,
        body: `感謝你完成問卷！${pointsAmount} 積分已存入錢包（1 積分 ≈ NT$${POINTS_VALUE_NTD}）。`,
        metadata: { surveyId, responseId, points: pointsAmount },
      })
      .catch((err: unknown) =>
        this.logger.error(`points reward 通知失敗 responseId=${responseId}`, err),
      );
  }

  // ─── 積分交易紀錄 ──────────────────────────────────────────────────────────

  async getPointsTransactions(userId: string, limit = 50) {
    return this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.type, ['points_in', 'points_spend']),
        ),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  // ─── 積分摘要 ──────────────────────────────────────────────────────────────

  async getPointsSummary(userId: string) {
    const wallet = await this.getWallet(userId);
    const allPoints = await this.db
      .select({
        amount: transactions.amount,
        type: transactions.type,
        status: transactions.status,
        completedAt: transactions.completedAt,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.type, ['points_in', 'points_spend']),
          eq(transactions.status, 'success'),
        ),
      );

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let totalEarned = 0;
    let totalSpent = 0;
    let thisMonth = 0;

    for (const r of allPoints) {
      if (r.type === 'points_in') {
        totalEarned += r.amount;
        const d = r.completedAt ?? r.createdAt;
        if (d && new Date(d) >= firstDayOfMonth) thisMonth += r.amount;
      } else if (r.type === 'points_spend') {
        totalSpent += r.amount;
      }
    }

    return {
      balance: wallet?.pointsBalance ?? 0,
      totalEarned,
      totalSpent,
      thisMonth,
      estimatedValue: Math.floor((wallet?.pointsBalance ?? 0) * POINTS_VALUE_NTD),
    };
  }

  // ─── 鎖定問卷預算（送審時呼叫）────────────────────────────────────────────
  // 將 totalBudget 從 cashBalance 移至 lockedCash
  // 若餘額不足則警告，但不阻擋（允許問券方後補儲值）

  async lockSurveyBudget(surveyorId: string, surveyId: string): Promise<void> {
    const surveyRows = await this.db
      .select({
        id: surveys.id,
        rewardPoints: surveys.rewardPoints,
        targetCount: surveys.targetCount,
      })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey || survey.rewardPoints === 0) return;

    const totalBudget = survey.rewardPoints * survey.targetCount;
    await this.ensureWallet(surveyorId);

    const walletRows = await this.db
      .select({ cashBalance: wallets.cashBalance })
      .from(wallets)
      .where(eq(wallets.userId, surveyorId))
      .limit(1);

    const available = walletRows[0]?.cashBalance ?? 0;
    const lockAmount = Math.min(totalBudget, available); // 鎖多少就移多少，不超過餘額

    if (lockAmount <= 0) return;

    const [txn] = await this.db
      .insert(transactions)
      .values({
        userId: surveyorId,
        type: 'reward_out',
        amount: lockAmount,
        status: 'pending',
        relatedSurveyId: surveyId,
        note: `問卷預算鎖定 NT$${lockAmount}（總需 NT$${totalBudget}）`,
        metadata: { event: 'survey_budget_lock', totalRequired: totalBudget },
      })
      .returning();

    await this.db.insert(journalEntries).values([
      { transactionId: txn.id, accountName: `wallet_${surveyorId}`, debitAmount: lockAmount, creditAmount: 0 },
      { transactionId: txn.id, accountName: 'survey_escrow', debitAmount: 0, creditAmount: lockAmount },
    ]);

    await this.db
      .update(wallets)
      .set({
        cashBalance: sql`cash_balance - ${lockAmount}`,
        lockedCash: sql`locked_cash + ${lockAmount}`,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.userId, surveyorId), sql`cash_balance >= ${lockAmount}`));

    this.logger.log(`Budget locked: survey=${surveyId} amount=${lockAmount}`);
  }

  // ─── 退回未用預算（問卷關閉時呼叫）──────────────────────────────────────────

  async unlockSurveyBudget(surveyorId: string, surveyId: string, completedCount: number): Promise<void> {
    const surveyRows = await this.db
      .select({ rewardPoints: surveys.rewardPoints, targetCount: surveys.targetCount })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey || survey.rewardPoints === 0) return;

    // 實際已支付 = completedCount × rewardPoints（不含手續費，手續費在 issueReward 時已扣）
    const totalLocked = survey.targetCount * survey.rewardPoints;
    const actualPaid = completedCount * survey.rewardPoints;
    const refundAmount = Math.max(0, totalLocked - actualPaid);

    if (refundAmount <= 0) return;

    const walletRows = await this.db
      .select({ lockedCash: wallets.lockedCash })
      .from(wallets)
      .where(eq(wallets.userId, surveyorId))
      .limit(1);

    const actualLocked = walletRows[0]?.lockedCash ?? 0;
    const toUnlock = Math.min(refundAmount, actualLocked);

    if (toUnlock <= 0) return;

    const [txn] = await this.db
      .insert(transactions)
      .values({
        userId: surveyorId,
        type: 'refund',
        amount: toUnlock,
        status: 'success',
        relatedSurveyId: surveyId,
        note: `問卷關閉，退回未用預算 NT$${toUnlock}`,
        completedAt: new Date(),
      })
      .returning();

    await this.db.insert(journalEntries).values([
      { transactionId: txn.id, accountName: 'survey_escrow', debitAmount: toUnlock, creditAmount: 0 },
      { transactionId: txn.id, accountName: `wallet_${surveyorId}`, debitAmount: 0, creditAmount: toUnlock },
    ]);

    await this.db
      .update(wallets)
      .set({
        cashBalance: sql`cash_balance + ${toUnlock}`,
        lockedCash: sql`locked_cash - ${toUnlock}`,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, surveyorId));

    this.logger.log(`Budget unlocked: survey=${surveyId} refund=${toUnlock}`);
  }

  // ─── 管理員：審核提領申請 ──────────────────────────────────────────────────

  async getPendingWithdrawals() {
    return this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.type, 'withdraw_request'), eq(transactions.status, 'pending')))
      .orderBy(transactions.createdAt)
      .limit(100);
  }

  async approveWithdrawal(transactionId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.type, 'withdraw_request')))
      .limit(1);

    const txn = rows[0];
    if (!txn) throw new NotFoundException('找不到提領申請');
    if (txn.status !== 'pending') throw new BadRequestException('此提領申請狀態不可核准');

    const now = new Date();

    // 建立 withdraw_complete transaction
    const [completeTxn] = await this.db
      .insert(transactions)
      .values({
        userId: txn.userId,
        type: 'withdraw_complete',
        amount: txn.amount,
        status: 'success',
        note: `提領核准完成（申請單 ${transactionId}）`,
        metadata: { originalTxnId: transactionId },
        completedAt: now,
      })
      .returning();

    await this.db.insert(journalEntries).values([
      { transactionId: completeTxn.id, accountName: 'withdraw_pending', debitAmount: txn.amount, creditAmount: 0 },
      { transactionId: completeTxn.id, accountName: 'escrow_esun', debitAmount: 0, creditAmount: txn.amount },
    ]);

    // 更新原申請單 → success；解鎖 lockedCash（真正扣除）
    await this.db
      .update(transactions)
      .set({ status: 'success', completedAt: now })
      .where(eq(transactions.id, transactionId));

    await this.db
      .update(wallets)
      .set({
        lockedCash: sql`locked_cash - ${txn.amount}`,
        version: sql`version + 1`,
        updatedAt: now,
      })
      .where(eq(wallets.userId, txn.userId));

    this.logger.log(`Withdrawal approved: txn=${transactionId} user=${txn.userId} amount=${txn.amount}`);
  }

  async rejectWithdrawal(transactionId: string, reason: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.type, 'withdraw_request')))
      .limit(1);

    const txn = rows[0];
    if (!txn) throw new NotFoundException('找不到提領申請');
    if (txn.status !== 'pending') throw new BadRequestException('此提領申請狀態不可拒絕');

    // 退回 lockedCash → cashBalance
    await this.db
      .update(transactions)
      .set({ status: 'cancelled', note: `拒絕原因：${reason}` })
      .where(eq(transactions.id, transactionId));

    await this.db
      .update(wallets)
      .set({
        cashBalance: sql`cash_balance + ${txn.amount}`,
        lockedCash: sql`locked_cash - ${txn.amount}`,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, txn.userId));

    this.logger.log(`Withdrawal rejected: txn=${transactionId} reason=${reason}`);
  }
}

// ─── PII masking helpers（Phase B）──────────────────────────────────────────

function maskBankAccount(account: string): string {
  if (account.length <= 4) return '*'.repeat(account.length);
  if (account.length <= 6) return account.slice(0, 2) + '*'.repeat(Math.max(0, account.length - 2));
  return account.slice(0, 2) + '*'.repeat(account.length - 6) + account.slice(-4);
}

function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '◯';
  return name[0] + '◯'.repeat(name.length - 2) + name[name.length - 1];
}
