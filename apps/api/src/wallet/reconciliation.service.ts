import { Injectable, Inject, Logger } from '@nestjs/common';
import { sql, eq } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { journalEntries, transactions, wallets, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

export interface ReconciliationReport {
  generatedAt: string;
  invariants: {
    label: string;
    pass: boolean;
    expected: number;
    actual: number;
    note?: string;
  }[];
  totals: {
    escrowEcpay: number;       // ECPay 託管端帳上應有的錢
    walletSum: number;          // 所有用戶錢包加總（DB 端）
    platformFeeRevenue: number; // 平台累計手續費收入
    rewardPayableOutstanding: number; // 應付未付獎勵（理論上應 = 0）
  };
  unbalancedTransactions: { id: string; debit: number; credit: number }[];
}

/**
 * Phase A：每日對帳服務。
 *
 * 核心不變式（complex-entry bookkeeping）：
 * 1. 每筆 transaction 的 debit total = credit total
 * 2. escrow_ecpay 帳餘額 = sum(wallet_*) 餘額 + reward_payable 中間餘額 - sum(platform_revenue)
 *    （從受試者 + 問券方角度等於 ECPay 端應有的錢）
 * 3. 所有 wallet_* 餘額（journal 計算）= wallets.cash_balance 加總（兩個來源應一致）
 *
 * 任何不變式失敗 → log error + 通知 admin。
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
  ) {}

  async runDaily(): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      generatedAt: new Date().toISOString(),
      invariants: [],
      totals: {
        escrowEcpay: 0,
        walletSum: 0,
        platformFeeRevenue: 0,
        rewardPayableOutstanding: 0,
      },
      unbalancedTransactions: [],
    };

    // 1. 不變式 #1：每筆 transaction 的 debit total = credit total
    const txTotals = await this.db
      .select({
        txnId: journalEntries.transactionId,
        debit: sql<number>`COALESCE(SUM(debit_amount), 0)::int`,
        credit: sql<number>`COALESCE(SUM(credit_amount), 0)::int`,
      })
      .from(journalEntries)
      .groupBy(journalEntries.transactionId);

    const unbalanced = txTotals.filter((t) => t.debit !== t.credit);
    report.unbalancedTransactions = unbalanced.map((u) => ({
      id: u.txnId,
      debit: u.debit,
      credit: u.credit,
    }));
    report.invariants.push({
      label: '每筆 transaction 借貸平衡',
      pass: unbalanced.length === 0,
      expected: 0,
      actual: unbalanced.length,
      note: unbalanced.length > 0 ? `${unbalanced.length} 筆不平衡` : undefined,
    });

    // 2. escrow_ecpay 帳本餘額（debits - credits）
    const escrowRow = await this.db
      .select({
        debits: sql<number>`COALESCE(SUM(debit_amount), 0)::int`,
        credits: sql<number>`COALESCE(SUM(credit_amount), 0)::int`,
      })
      .from(journalEntries)
      .where(eq(journalEntries.accountName, 'escrow_ecpay'));
    const escrowBalance = (escrowRow[0]?.debits ?? 0) - (escrowRow[0]?.credits ?? 0);
    report.totals.escrowEcpay = escrowBalance;

    // 3. 所有 wallet_* 帳本加總
    const walletJournalRow = await this.db
      .select({
        debits: sql<number>`COALESCE(SUM(debit_amount), 0)::int`,
        credits: sql<number>`COALESCE(SUM(credit_amount), 0)::int`,
      })
      .from(journalEntries)
      .where(sql`account_name LIKE 'wallet_%'`);
    const walletJournalBalance = (walletJournalRow[0]?.credits ?? 0) - (walletJournalRow[0]?.debits ?? 0);

    // 4. wallets 表 cash_balance + locked_cash 分別計算
    //    cash 部分 應 = journal wallet_* 餘額
    //    locked 部分 應 = journal survey_escrow 餘額（鎖定的錢都在 survey_escrow）
    const walletTableRow = await this.db
      .select({
        cash: sql<number>`COALESCE(SUM(cash_balance), 0)::int`,
        locked: sql<number>`COALESCE(SUM(locked_cash), 0)::int`,
      })
      .from(wallets);
    const walletCashSum = walletTableRow[0]?.cash ?? 0;
    const walletLockedSum = walletTableRow[0]?.locked ?? 0;
    report.totals.walletSum = walletCashSum + walletLockedSum;

    report.invariants.push({
      label: 'wallets.cash 加總 = journal wallet_* 餘額',
      pass: walletCashSum === walletJournalBalance,
      expected: walletJournalBalance,
      actual: walletCashSum,
      note: walletCashSum !== walletJournalBalance
        ? `差額 ${walletCashSum - walletJournalBalance}`
        : undefined,
    });

    // 4b. locked_cash 對應 survey_escrow journal
    const surveyEscrowRow = await this.db
      .select({
        debits: sql<number>`COALESCE(SUM(debit_amount), 0)::int`,
        credits: sql<number>`COALESCE(SUM(credit_amount), 0)::int`,
      })
      .from(journalEntries)
      .where(eq(journalEntries.accountName, 'survey_escrow'));
    const surveyEscrowBalance = (surveyEscrowRow[0]?.credits ?? 0) - (surveyEscrowRow[0]?.debits ?? 0);

    report.invariants.push({
      label: 'wallets.locked 加總 = journal survey_escrow 餘額',
      pass: walletLockedSum === surveyEscrowBalance,
      expected: surveyEscrowBalance,
      actual: walletLockedSum,
      note: walletLockedSum !== surveyEscrowBalance
        ? `差額 ${walletLockedSum - surveyEscrowBalance}`
        : undefined,
    });

    // 5. platform revenue (sum of platform_fee transactions, success)
    const feeRow = await this.db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)::int` })
      .from(transactions)
      .where(sql`type = 'platform_fee' AND status = 'success'`);
    report.totals.platformFeeRevenue = feeRow[0]?.total ?? 0;

    // 6. reward_payable 帳本餘額（中間帳，理論上應 = 0 因為立刻完成）
    const payableRow = await this.db
      .select({
        debits: sql<number>`COALESCE(SUM(debit_amount), 0)::int`,
        credits: sql<number>`COALESCE(SUM(credit_amount), 0)::int`,
      })
      .from(journalEntries)
      .where(eq(journalEntries.accountName, 'reward_payable'));
    const payableBalance = (payableRow[0]?.credits ?? 0) - (payableRow[0]?.debits ?? 0);
    report.totals.rewardPayableOutstanding = payableBalance;

    report.invariants.push({
      label: 'reward_payable 中間帳應為 0',
      pass: payableBalance === 0,
      expected: 0,
      actual: payableBalance,
    });

    // 7. 不變式：托管帳（escrow_ecpay + escrow_mock）= wallets 加總 + 累計手續費 + 退款
    //    Dev 環境用 mockDeposit 走 escrow_mock；prod 走 escrow_ecpay；合計才完整
    const mockEscrowRow = await this.db
      .select({
        debits: sql<number>`COALESCE(SUM(debit_amount), 0)::int`,
        credits: sql<number>`COALESCE(SUM(credit_amount), 0)::int`,
      })
      .from(journalEntries)
      .where(eq(journalEntries.accountName, 'escrow_mock'));
    const mockEscrowBalance = (mockEscrowRow[0]?.debits ?? 0) - (mockEscrowRow[0]?.credits ?? 0);
    const totalEscrow = escrowBalance + mockEscrowBalance;

    const expectedEscrow = walletCashSum + walletLockedSum + report.totals.platformFeeRevenue;
    const escrowDiff = totalEscrow - expectedEscrow;
    report.invariants.push({
      label: '托管帳 ≈ wallets 加總 + 累計手續費（容差 0）',
      pass: Math.abs(escrowDiff) === 0,
      expected: expectedEscrow,
      actual: totalEscrow,
      note: escrowDiff !== 0
        ? `差額 ${escrowDiff}（escrow_ecpay=${escrowBalance} escrow_mock=${mockEscrowBalance} wallets=${walletCashSum + walletLockedSum} fees=${report.totals.platformFeeRevenue}）`
        : undefined,
    });

    // 任一不變式 fail → 通知 admin
    const failures = report.invariants.filter((i) => !i.pass);
    if (failures.length > 0) {
      this.logger.error(`Reconciliation FAILED: ${failures.length} invariants broken`);
      this.logger.error(JSON.stringify(report, null, 2));
      await this.alertAdmins(report);
    } else {
      this.logger.log(`Reconciliation OK: all ${report.invariants.length} invariants pass`);
    }

    return report;
  }

  private async alertAdmins(report: ReconciliationReport) {
    // 用 Drizzle query builder（avoid driver-specific .rows shape）
    const adminRows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));

    const failedLabels = report.invariants
      .filter((i) => !i.pass)
      .map((i) => i.label)
      .join('、');

    for (const admin of adminRows) {
      try {
        await this.notifications.create({
          userId: admin.id,
          type: 'system',
          title: '🚨 對帳異常',
          body: `每日對帳發現 ${report.invariants.filter((i) => !i.pass).length} 項不變式失敗：${failedLabels}`,
          metadata: { report: report as unknown as Record<string, unknown> },
        });
      } catch (err) {
        this.logger.error(`對帳通知 admin ${admin.id} 失敗`, err);
      }
    }
  }
}
