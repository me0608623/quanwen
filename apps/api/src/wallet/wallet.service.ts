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
import type { AppDb, DbExecutor } from '../db';
import {
  wallets,
  transactions,
  journalEntries,
  surveys,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { EcpayService } from './ecpay.service';
import { CryptoService } from '../common/crypto.service';
import { KycService } from '../kyc/kyc.service';
import { SystemConfigService } from '../system-config/system-config.service';

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
    private readonly systemConfig: SystemConfigService,
  ) {}

  // ─── 手續費 / 單份成本（獎金 + 手續費率）────────────────────────────────────
  // 鎖定預算、預算檢查、發獎扣款三處必須用同一個單份成本，否則鎖定額與實付額不一致。
  private feeFor(reward: number): number {
    return Math.ceil(reward * this.systemConfig.getPlatformFeeRate());
  }
  private unitCostFor(reward: number): number {
    return reward + this.feeFor(reward);
  }

  // ─── 取得（或建立）錢包 ───────────────────────────────────────────────────

  async ensureWallet(userId: string, exec: DbExecutor = this.db) {
    const rows = await exec
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (rows[0]) return rows[0];

    const [created] = await exec
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
    const minDeposit = this.systemConfig.getMinDeposit();
    const maxDeposit = this.systemConfig.getMaxDeposit();
    if (amount < minDeposit || amount > maxDeposit) {
      throw new BadRequestException(`儲值金額需在 NT$${minDeposit}～NT$${maxDeposit} 之間`);
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

    // Payment succeeded — credit wallet.
    // Guard against concurrent ECPay retries: claim exclusive processing by
    // doing an atomic conditional UPDATE (WHERE status='pending'). If 0 rows
    // are updated, another thread already claimed this txn — skip safely.
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(transactions)
        .set({
          status: 'success',
          note: `ECPay 儲值完成 NT$${txn.amount}（TradeNo: ${result.tradeNo}）`,
          completedAt: now,
          metadata: { ecpayTradeNo: result.merchantTradeNo, ecpayServerTradeNo: result.tradeNo },
        })
        .where(and(eq(transactions.id, txn.id), eq(transactions.status, 'pending')))
        .returning({ id: transactions.id });

      if (claimed.length === 0) {
        // Concurrent callback already processed — skip to avoid double-credit
        return;
      }

      await tx.insert(journalEntries).values([
        { transactionId: txn.id, accountName: 'escrow_ecpay', debitAmount: txn.amount, creditAmount: 0 },
        { transactionId: txn.id, accountName: `wallet_${txn.userId}`, debitAmount: 0, creditAmount: txn.amount },
      ]);

      await tx
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance + ${txn.amount}`,
          version: sql`version + 1`,
          updatedAt: now,
        })
        .where(eq(wallets.userId, txn.userId));
    });

    this.logger.log(`ECPay payment success: user=${txn.userId} amount=${txn.amount} tradeNo=${result.merchantTradeNo}`);
    return '1|OK';
  }

  // ─── Mock 儲值（正式環境替換為 ECPay 下單 + webhook） ─────────────────────

  async mockDeposit(userId: string, amount: number): Promise<void> {
    await this.ensureWallet(userId);

    await this.db.transaction(async (tx) => {
      // 建立 transaction 紀錄
      const [txn] = await tx
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
      await tx.insert(journalEntries).values([
        { transactionId: txn.id, accountName: 'escrow_mock', debitAmount: amount, creditAmount: 0 },
        { transactionId: txn.id, accountName: `wallet_${userId}`, debitAmount: 0, creditAmount: amount },
      ]);

      // 更新錢包餘額
      await tx
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance + ${amount}`,
          version: sql`version + 1`,
          updatedAt: new Date(),
        })
        .where(eq(wallets.userId, userId));
    });

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
  }): Promise<{ status: 'success' | 'pending' | 'duplicate' | 'skipped' }> {
    const { surveyId, responseId, respondentId, surveyorId, rewardAmount } = params;

    if (rewardAmount <= 0) return { status: 'skipped' };

    const platformFee = this.feeFor(rewardAmount);
    const totalDeduct = rewardAmount + platformFee;

    await this.ensureWallet(surveyorId);
    await this.ensureWallet(respondentId);

    const now = new Date();

    // ── 整個 issueReward 包在一個 db.transaction 裡 ──────────────────────────
    // 原因：若 deduction 成功但後續 INSERT/UPDATE 失敗，錢會從問券方扣掉
    // 但受試者沒收到、journal 也沒有記錄 → 帳務資料不一致。
    // 將全部操作包在同一個 transaction，保證「扣問券方 + 入受試者 + 帳分錄」要嘛全成功要嘛全滾回。
    const txResult = { status: 'pending' as 'success' | 'pending', duplicate: false }; // hoisted so logger/notification can read outside tx
    try {
    await this.db.transaction(async (tx) => {
      const existingReward = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(
          eq(transactions.relatedResponseId, responseId),
          eq(transactions.type, 'reward_in'),
        ))
        .limit(1);
      if (existingReward.length > 0) {
        txResult.duplicate = true;
        this.logger.log(`Reward skipped: response=${responseId} already has reward transaction`);
        return;
      }

      // ── 原子扣款：優先動用問卷鎖定預算(lockedCash/survey_escrow)，不足再動 cashBalance ──
      // 發布問卷時已把 (獎金+手續費)×目標數 鎖進 lockedCash，發獎理應從這筆托管款支付；
      // 若改從 cashBalance 另扣，鎖定款會永遠退不回 → 等同對問券方雙重收費（已修）。
      // 隔離情境未先鎖定(lockedCash=0)時，fallback 全由 cashBalance 支付，維持既有行為。
      const [pre] = await tx
        .select({ locked: wallets.lockedCash, cash: wallets.cashBalance, version: wallets.version })
        .from(wallets)
        .where(eq(wallets.userId, surveyorId))
        .limit(1);

      const preLocked = pre?.locked ?? 0;
      const preCash = pre?.cash ?? 0;
      const escrowPortion = Math.min(preLocked, totalDeduct);
      const cashPortion = totalDeduct - escrowPortion;
      const canPay = preLocked + preCash >= totalDeduct;

      const deducted = canPay
        ? await tx
            .update(wallets)
            .set({
              lockedCash: sql`locked_cash - ${escrowPortion}`,
              cashBalance: sql`cash_balance - ${cashPortion}`,
              version: sql`version + 1`,
              updatedAt: now,
            })
            .where(and(
              eq(wallets.userId, surveyorId),
              eq(wallets.version, pre?.version ?? 0),
              sql`locked_cash >= ${escrowPortion}`,
              sql`cash_balance >= ${cashPortion}`,
            ))
            .returning({ id: wallets.id })
        : [];

      txResult.status = deducted.length > 0 ? 'success' : 'pending';

      // ── 建立三筆 transaction（狀態由實際扣款結果決定）──────────────────────
      const [rewardOutTxn] = await tx
        .insert(transactions)
        .values({
          userId: surveyorId,
          type: 'reward_out',
          amount: totalDeduct,
          status: txResult.status,
          relatedSurveyId: surveyId,
          relatedResponseId: responseId,
          note: `問券方支付獎勵 NT$${rewardAmount} + 手續費 NT$${platformFee}`,
          completedAt: txResult.status === 'success' ? now : null,
        })
        .returning();

      const [rewardInTxn] = await tx
        .insert(transactions)
        .values({
          userId: respondentId,
          type: 'reward_in',
          amount: rewardAmount,
          status: txResult.status,
          relatedSurveyId: surveyId,
          relatedResponseId: responseId,
          note: `完成問卷獲得獎勵 NT$${rewardAmount}`,
          completedAt: txResult.status === 'success' ? now : null,
        })
        .returning();

      const [feeTxn] = await tx
        .insert(transactions)
        .values({
          userId: surveyorId,
          type: 'platform_fee',
          amount: platformFee,
          status: txResult.status,
          relatedSurveyId: surveyId,
          relatedResponseId: responseId,
          note: `平台手續費 ${Math.round(this.systemConfig.getPlatformFeeRate() * 100)}%`,
          completedAt: txResult.status === 'success' ? now : null,
        })
        .returning();

      // ── 複式記帳分錄：僅在實際扣款成功時寫入 ───────────────────────────────
      // pending（問券方資金不足）時不寫分錄；否則總帳會記入從未發生的資金流動，
      // 造成 wallet_* 帳與 cash_balance、survey_escrow 帳與 locked_cash 永久偏差（已修）。
      if (txResult.status === 'success') {
        // reward_out 借方依實際資金來源拆分：托管款走 survey_escrow，cash 走 wallet_<surveyor>
        const rewardOutDebits = [
          escrowPortion > 0
            ? { transactionId: rewardOutTxn.id, accountName: 'survey_escrow', debitAmount: escrowPortion, creditAmount: 0 }
            : null,
          cashPortion > 0
            ? { transactionId: rewardOutTxn.id, accountName: `wallet_${surveyorId}`, debitAmount: cashPortion, creditAmount: 0 }
            : null,
        ].filter((e): e is NonNullable<typeof e> => e !== null);

        await tx.insert(journalEntries).values([
          ...rewardOutDebits,
          { transactionId: rewardOutTxn.id, accountName: 'reward_payable', debitAmount: 0, creditAmount: totalDeduct },
          { transactionId: rewardInTxn.id, accountName: 'reward_payable', debitAmount: rewardAmount, creditAmount: 0 },
          { transactionId: rewardInTxn.id, accountName: `wallet_${respondentId}`, debitAmount: 0, creditAmount: rewardAmount },
          { transactionId: feeTxn.id, accountName: 'reward_payable', debitAmount: platformFee, creditAmount: 0 },
          { transactionId: feeTxn.id, accountName: 'platform_revenue', debitAmount: 0, creditAmount: platformFee },
        ]);

        // 受試者入帳
        await tx
          .update(wallets)
          .set({
            cashBalance: sql`cash_balance + ${rewardAmount}`,
            version: sql`version + 1`,
            updatedAt: now,
          })
          .where(eq(wallets.userId, respondentId));
      }
    });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        this.logger.log(`Reward skipped: response=${responseId} concurrent duplicate`);
        return { status: 'duplicate' };
      }
      throw err;
    }

    if (txResult.duplicate) return { status: 'duplicate' };

    this.logger.log(
      `Reward issued: survey=${surveyId} response=${responseId} amount=${rewardAmount} fee=${platformFee} status=${txResult.status}`,
    );

    if (txResult.status === 'success') {
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

    return { status: txResult.status };
  }

  // ─── 申請提領 ─────────────────────────────────────────────────────────────

  async requestWithdrawal(
    userId: string,
    amount: number,
    bankInfo: { bankCode: string; bankAccount: string; accountName: string },
  ): Promise<{ transactionId: string }> {
    // Stateless fast-fail — no DB access, safe outside transaction
    const minWithdrawal = this.systemConfig.getMinWithdrawal();
    if (amount < minWithdrawal) {
      throw new BadRequestException(`最低提領金額為 NT$${minWithdrawal}`);
    }

    // KYC reads a separate table and does not participate in the withdrawal
    // accounting — safe to call before the transaction.
    await this.kyc.assertKycForWithdrawal(userId, amount);

    await this.ensureWallet(userId);

    // All balance/limit validation and the wallet deduction happen inside a
    // single transaction.  The wallet row is locked with FOR UPDATE at the
    // start so that concurrent requests for the same user are serialised:
    // the second request cannot read a stale balance or stale daily total
    // until the first transaction commits or rolls back.
    // This eliminates the TOCTOU window that existed when both checks lived
    // outside the transaction (issue #35).
    const txnId = await this.db.transaction(async (tx) => {
      // 1. Acquire row-level lock → serialises concurrent withdrawals for this user
      const walletRows = await tx
        .select({
          cashBalance: wallets.cashBalance,
          version: wallets.version,
        })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .for('update');

      const wallet = walletRows[0];
      if (!wallet) throw new NotFoundException('找不到錢包');

      // 2. Balance check (inside tx, after acquiring the lock)
      if (wallet.cashBalance < amount) {
        throw new BadRequestException('餘額不足');
      }

      // 3. Daily limit check (inside tx, serialised by the wallet lock)
      //    被駁回/取消的提領已退回餘額，不應佔用每日額度。
      const todayResult = await tx
        .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, 'withdraw_request'),
            sql`status NOT IN ('failed', 'cancelled')`,
            sql`created_at >= NOW() - interval '1 day'`,
          ),
        );

      const usedToday = Number(todayResult[0]?.total ?? 0);
      const maxDailyWithdrawal = this.systemConfig.getMaxDailyWithdrawal();
      if (usedToday + amount > maxDailyWithdrawal) {
        throw new BadRequestException(
          `每日提領上限 NT$${maxDailyWithdrawal}，今日已申請 NT$${usedToday}`,
        );
      }

      // 4. Atomic deduction — secondary guard (handles edge cases where lock
      //    semantics differ between PGlite in tests and real PG in prod)
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
        throw new BadRequestException('餘額不足（可能有其他提領正在處理）');
      }

      // 5. Create the withdrawal request record
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
      .select({ rewardPoints: surveys.rewardPoints, targetCount: surveys.targetCount, surveyorId: surveys.surveyorId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    const survey = surveyRows[0];
    if (!survey) throw new NotFoundException('找不到問卷');
    // 僅問卷擁有者可查預算需求，避免他人枚舉任意問卷的獎金/目標數設定。
    if (survey.surveyorId !== surveyorId) throw new NotFoundException('找不到問卷');

    // 含 10% 手續費，與實際發獎扣款一致；否則剛好足額本金的問卷會通過檢查卻發不出獎。
    const requiredAmount = this.unitCostFor(survey.rewardPoints) * survey.targetCount;
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

  /**
   * 發放積分。
   * @param exec 可選的外部 transaction；傳入時掛在呼叫方的交易上（與呼叫方同生共死，
   *             失敗一起 rollback），不傳則自己開一個 transaction。
   */
  async grantPoints(
    userId: string,
    pointsAmount: number,
    note: string,
    exec?: DbExecutor,
  ): Promise<void> {
    if (pointsAmount <= 0) return;

    if (exec) {
      // 掛在外部交易上：ensureWallet 與帳務必須走同一個 exec 才有原子性
      await this.ensureWallet(userId, exec);
      await this.grantPointsInTx(exec, userId, pointsAmount, note);
    } else {
      await this.ensureWallet(userId);
      await this.db.transaction((tx) => this.grantPointsInTx(tx, userId, pointsAmount, note));
    }

    this.logger.log(`Bonus points granted: user=${userId.slice(0, 8)} points=${pointsAmount} (${note})`);
  }

  /** grantPoints 的帳務核心：交易/分錄/錢包更新，全部走傳入的 exec（不自開 transaction）。 */
  private async grantPointsInTx(
    exec: DbExecutor,
    userId: string,
    pointsAmount: number,
    note: string,
  ): Promise<void> {
    const now = new Date();
    const [txn] = await exec
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

    await exec.insert(journalEntries).values([
      { transactionId: txn.id, accountName: 'points_liability', debitAmount: pointsAmount, creditAmount: 0 },
      { transactionId: txn.id, accountName: `points_wallet_${userId}`, debitAmount: 0, creditAmount: pointsAmount },
    ]);

    await exec
      .update(wallets)
      .set({
        pointsBalance: sql`points_balance + ${pointsAmount}`,
        version: sql`version + 1`,
        updatedAt: now,
      })
      .where(eq(wallets.userId, userId));
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

    let duplicate = false;
    try {
    await this.db.transaction(async (tx) => {
      const existingPoints = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(
          eq(transactions.relatedResponseId, responseId),
          eq(transactions.type, 'points_in'),
        ))
        .limit(1);
      if (existingPoints.length > 0) {
        duplicate = true;
        this.logger.log(`Points skipped: response=${responseId} already has points transaction`);
        return;
      }

      const [txn] = await tx
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

      await tx.insert(journalEntries).values([
        { transactionId: txn.id, accountName: 'points_liability', debitAmount: pointsAmount, creditAmount: 0 },
        { transactionId: txn.id, accountName: `points_wallet_${respondentId}`, debitAmount: 0, creditAmount: pointsAmount },
      ]);

      await tx
        .update(wallets)
        .set({
          pointsBalance: sql`points_balance + ${pointsAmount}`,
          version: sql`version + 1`,
          updatedAt: now,
        })
        .where(eq(wallets.userId, respondentId));
    });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === '23505') {
        this.logger.log(`Points skipped: response=${responseId} concurrent duplicate`);
        return;
      }
      throw err;
    }
    if (duplicate) return;

    this.logger.log(`Points issued: survey=${surveyId} response=${responseId} points=${pointsAmount}`);

    this.notifications
      .create({
        userId: respondentId,
        type: 'reward_issued',
        title: `獲得 ${pointsAmount} 積分`,
        body: `感謝你完成問卷！${pointsAmount} 積分已存入錢包（1 積分 ≈ NT$${this.systemConfig.getPointsValueNtd()}）。`,
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
      estimatedValue: Math.floor((wallet?.pointsBalance ?? 0) * this.systemConfig.getPointsValueNtd()),
    };
  }

  // ─── 鎖定問卷預算（送審時呼叫）────────────────────────────────────────────
  // 將 totalBudget 從 cashBalance 移至 lockedCash
  // 若餘額不足則警告，但不阻擋（允許問券方後補儲值）
  //
  // exec?: 傳入外部 transaction 時，鎖定操作掛在呼叫方的交易上，與 surveys.status
  // 更新形成原子操作。不傳則自己開 transaction（獨立調用情境）。

  async lockSurveyBudget(surveyorId: string, surveyId: string, exec?: DbExecutor): Promise<void> {
    const reader: DbExecutor = exec ?? this.db;

    const surveyRows = await reader
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

    // 鎖定 (獎金 + 10% 手續費) × 目標數，確保發獎時托管款足以支付本金與手續費。
    const totalBudget = this.unitCostFor(survey.rewardPoints) * survey.targetCount;
    await this.ensureWallet(surveyorId, reader);

    const walletRows = await reader
      .select({ cashBalance: wallets.cashBalance })
      .from(wallets)
      .where(eq(wallets.userId, surveyorId))
      .limit(1);

    const available = walletRows[0]?.cashBalance ?? 0;
    const lockAmount = Math.min(totalBudget, available); // 鎖多少就移多少，不超過餘額

    if (lockAmount <= 0) return;

    const performLock = async (tx: DbExecutor) => {
      const updateResult = await tx
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance - ${lockAmount}`,
          lockedCash: sql`locked_cash + ${lockAmount}`,
          version: sql`version + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.userId, surveyorId), sql`cash_balance >= ${lockAmount}`))
        .returning({ id: wallets.id });

      if (updateResult.length === 0) {
        // Insufficient balance after concurrent depletion — skip lock silently
        // (the survey was published with aiReviewEnabled=false or insufficient budget warning was shown)
        return;
      }

      const [txn] = await tx
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

      await tx.insert(journalEntries).values([
        { transactionId: txn.id, accountName: `wallet_${surveyorId}`, debitAmount: lockAmount, creditAmount: 0 },
        { transactionId: txn.id, accountName: 'survey_escrow', debitAmount: 0, creditAmount: lockAmount },
      ]);
    };

    if (exec) {
      // Already in a caller-provided transaction — run directly (no nested tx)
      await performLock(exec);
    } else {
      // Stand-alone call — open our own transaction
      await this.db.transaction((tx) => performLock(tx));
    }

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

    // 鎖定與實付都以單份成本（獎金 + 手續費）計算，與 lockSurveyBudget/issueReward 一致。
    const unitCost = this.unitCostFor(survey.rewardPoints);
    const totalLocked = survey.targetCount * unitCost;
    const actualPaid = completedCount * unitCost;
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

    // Same atomicity pattern as lockSurveyBudget: update wallet first inside
    // a transaction, insert journal entries only if the update succeeds.
    await this.db.transaction(async (tx) => {
      const updateResult = await tx
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance + ${toUnlock}`,
          lockedCash: sql`locked_cash - ${toUnlock}`,
          version: sql`version + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.userId, surveyorId), sql`locked_cash >= ${toUnlock}`))
        .returning({ id: wallets.id });

      if (updateResult.length === 0) {
        // locked_cash was already depleted by a concurrent call — skip silently
        return;
      }

      const [txn] = await tx
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

      await tx.insert(journalEntries).values([
        { transactionId: txn.id, accountName: 'survey_escrow', debitAmount: toUnlock, creditAmount: 0 },
        { transactionId: txn.id, accountName: `wallet_${surveyorId}`, debitAmount: 0, creditAmount: toUnlock },
      ]);
    });

    this.logger.log(`Budget unlocked: survey=${surveyId} refund=${toUnlock}`);
  }

  // ─── 管理員：手動調整現金餘額 ─────────────────────────────────────────────
  // amount 正=增加，負=扣除；存入 transactions 的金額恆正（Math.abs）
  // 雙向 journal_entries：DR platform_adjustment / CR wallet_userId（增加）
  //                      ：DR wallet_userId / CR platform_adjustment（扣除）

  async adminAdjustBalance(params: {
    userId: string;
    adminId: string;
    amount: number; // integer NT$，正=增加，負=扣除
    reason: string;
  }): Promise<void> {
    const { userId, adminId, amount, reason } = params;
    if (!Number.isInteger(amount) || amount === 0) {
      throw new BadRequestException('amount 必須為非零整數 NT$');
    }

    await this.ensureWallet(userId);
    const absAmount = Math.abs(amount);
    const isIncrease = amount > 0;
    const now = new Date();

    await this.db.transaction(async (tx) => {
      if (!isIncrease) {
        // 扣除：需確保餘額不為負
        const updateResult = await tx
          .update(wallets)
          .set({
            cashBalance: sql`cash_balance - ${absAmount}`,
            version: sql`version + 1`,
            updatedAt: now,
          })
          .where(and(eq(wallets.userId, userId), sql`cash_balance >= ${absAmount}`))
          .returning({ id: wallets.id });

        if (updateResult.length === 0) {
          throw new BadRequestException('餘額不足，無法扣除');
        }
      } else {
        await tx
          .update(wallets)
          .set({
            cashBalance: sql`cash_balance + ${absAmount}`,
            version: sql`version + 1`,
            updatedAt: now,
          })
          .where(eq(wallets.userId, userId));
      }

      const [txn] = await tx
        .insert(transactions)
        .values({
          userId,
          type: 'admin_adjustment',
          amount: absAmount,
          status: 'success',
          note: `管理員調整：${isIncrease ? '+' : '-'}NT$${absAmount}（${reason}）`,
          metadata: { adminId, reason, direction: isIncrease ? 'increase' : 'decrease' },
          approvedBy: adminId,
          actionAt: now,
          completedAt: now,
        })
        .returning();

      // 雙向分錄（platform_adjustment 為對沖帳）
      if (isIncrease) {
        await tx.insert(journalEntries).values([
          { transactionId: txn.id, accountName: 'platform_adjustment', debitAmount: absAmount, creditAmount: 0 },
          { transactionId: txn.id, accountName: `wallet_${userId}`, debitAmount: 0, creditAmount: absAmount },
        ]);
      } else {
        await tx.insert(journalEntries).values([
          { transactionId: txn.id, accountName: `wallet_${userId}`, debitAmount: absAmount, creditAmount: 0 },
          { transactionId: txn.id, accountName: 'platform_adjustment', debitAmount: 0, creditAmount: absAmount },
        ]);
      }
    });

    this.logger.log(`Admin balance adjustment: user=${userId} amount=${amount} admin=${adminId} reason=${reason}`);

    this.notifications
      .create({
        userId,
        type: 'system',
        title: `帳戶餘額已由平台調整 ${isIncrease ? '+' : ''}NT$${isIncrease ? absAmount : -absAmount}`,
        body: `調整原因：${reason}`,
        metadata: { adminId, amount, reason },
      })
      .catch((err: unknown) =>
        this.logger.error(`admin_adjustment 通知失敗 userId=${userId}`, err),
      );
  }

  // ─── 管理員：查看用戶錢包詳情 ──────────────────────────────────────────────

  async getAdminWalletDetail(userId: string) {
    const wallet = await this.getWallet(userId);
    const recentTxns = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(20);
    return { wallet, recentTransactions: recentTxns };
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

  async approveWithdrawal(transactionId: string, adminId: string, ip: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.type, 'withdraw_request')))
      .limit(1);

    const txn = rows[0];
    if (!txn) throw new NotFoundException('找不到提領申請');
    if (txn.status !== 'pending') throw new BadRequestException('此提領申請狀態不可核准');

    const now = new Date();

    await this.db.transaction(async (tx) => {
      // Atomic: deduct lockedCash first (guarded), then create records
      const updated = await tx
        .update(wallets)
        .set({
          lockedCash: sql`locked_cash - ${txn.amount}`,
          version: sql`version + 1`,
          updatedAt: now,
        })
        .where(and(eq(wallets.userId, txn.userId), sql`locked_cash >= ${txn.amount}`))
        .returning({ id: wallets.id });

      if (updated.length === 0) {
        throw new BadRequestException('lockedCash 不足，可能已被其他操作消耗');
      }

      // 建立 withdraw_complete transaction
      const [completeTxn] = await tx
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

      await tx.insert(journalEntries).values([
        { transactionId: completeTxn.id, accountName: 'withdraw_pending', debitAmount: txn.amount, creditAmount: 0 },
        { transactionId: completeTxn.id, accountName: 'escrow_esun', debitAmount: 0, creditAmount: txn.amount },
      ]);

      // 更新原申請單 → success，並寫入稽核欄位
      await tx
        .update(transactions)
        .set({ status: 'success', completedAt: now, approvedBy: adminId, actionAt: now, actionIp: ip })
        .where(eq(transactions.id, transactionId));
    });

    this.logger.log(`Withdrawal approved: txn=${transactionId} user=${txn.userId} amount=${txn.amount} admin=${adminId} ip=${ip}`);
  }

  async rejectWithdrawal(transactionId: string, reason: string, adminId: string, ip: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.type, 'withdraw_request')))
      .limit(1);

    const txn = rows[0];
    if (!txn) throw new NotFoundException('找不到提領申請');
    if (txn.status !== 'pending') throw new BadRequestException('此提領申請狀態不可拒絕');

    const now = new Date();

    // 退回 lockedCash → cashBalance (atomic: wallet update first, status update inside tx)
    await this.db.transaction(async (tx) => {
      await tx
        .update(wallets)
        .set({
          cashBalance: sql`cash_balance + ${txn.amount}`,
          lockedCash: sql`locked_cash - ${txn.amount}`,
          version: sql`version + 1`,
          updatedAt: now,
        })
        .where(and(eq(wallets.userId, txn.userId), sql`locked_cash >= ${txn.amount}`));

      await tx
        .update(transactions)
        .set({ status: 'cancelled', note: `拒絕原因：${reason}`, approvedBy: adminId, actionAt: now, actionIp: ip })
        .where(eq(transactions.id, transactionId));
    });

    this.logger.log(`Withdrawal rejected: txn=${transactionId} reason=${reason} admin=${adminId} ip=${ip}`);
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
