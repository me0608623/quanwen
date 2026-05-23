import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { transactions, surveyResponses, users } from '../db/schema';
import { ZaiClient } from '../ai-audit/zai.client';
import { parseWithdrawalRisk, GROUNDING_SUFFIX } from '../ai-audit/schemas';

export interface WithdrawalRisk {
  riskLevel: 'low' | 'medium' | 'high';
  redFlags: string[];        // 具體紅旗
  recommendation: 'approve' | 'manual_review' | 'reject';
  reasoning: string;         // 1-2 句說明
}

@Injectable()
export class WithdrawalRiskService {
  private readonly logger = new Logger(WithdrawalRiskService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly zai: ZaiClient,
  ) {}

  async assessRisk(transactionId: string): Promise<WithdrawalRisk> {
    // 取 transaction
    const txRows = await this.db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        amount: transactions.amount,
        status: transactions.status,
        metadata: transactions.metadata,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .limit(1);

    const tx = txRows[0];
    if (!tx) throw new NotFoundException('提領申請不存在');

    // 取使用者資料 + 歷史
    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, tx.userId))
      .limit(1);
    const user = userRows[0];

    // 累計獎勵收入
    const earningsRows = await this.db
      .select({
        totalEarnings: sql<number>`COALESCE(SUM(amount), 0)::int`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, tx.userId),
          eq(transactions.type, 'reward_in'),
          eq(transactions.status, 'success'),
        ),
      );
    const earnings = earningsRows[0] ?? { totalEarnings: 0, count: 0 };

    // 可疑填答數
    const susp = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.respondentId, tx.userId),
          sql`${surveyResponses.antiCheatScore} >= 60`,
        ),
      );
    const suspiciousCount = susp[0]?.count ?? 0;

    const accountAgeDays = user
      ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const meta = (tx.metadata ?? {}) as { bankCode?: string; bankAccount?: string; accountName?: string };

    const prompt = [
      '請評估這筆提領申請的詐欺/作弊風險：',
      '',
      `提領金額：NT$${tx.amount}`,
      `銀行：${meta.bankCode ?? '未知'} / 帳號：${meta.bankAccount ?? '未知'} / 戶名：${meta.accountName ?? '未知'}`,
      `申請時間：${tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt)}`,
      '',
      `使用者：${user?.displayName ?? '未知'} (${user?.email ?? '無 email'})`,
      `Email 已驗證：${user?.emailVerified ? '是' : '否'}`,
      `帳號建立至今：${accountAgeDays} 天`,
      `歷史累計獎勵收入：NT$${earnings.totalEarnings}（${earnings.count} 筆）`,
      `可疑填答紀錄：${suspiciousCount} 筆`,
      '',
      '判斷準則：',
      '- 提領金額 > 累計獎勵：高度可疑（無中生有）',
      '- 帳號 < 3 天且大額提領：高度可疑',
      '- Email 未驗證：中度可疑',
      '- 可疑填答 ≥ 3 筆：高度可疑',
      '- 戶名異常（純英數、單字、明顯假名）：注意',
      '',
      '回傳 JSON：',
      '{',
      '  "riskLevel": "low" | "medium" | "high",',
      '  "redFlags": ["紅旗 1", ...],',
      '  "recommendation": "approve" | "manual_review" | "reject",',
      '  "reasoning": "1-2 句說明"',
      '}',
    ].join('\n');

    try {
      // Phase II.2: Zod schema 驗證輸出，GROUNDING_SUFFIX 防幻覺
      const raw = await this.zai.jsonChat<unknown>(
        '你是金融反詐分析師。給出客觀的提領風險評估。' +
          '只回傳合法 JSON，繁體中文，redFlags 每項 ≤ 35 字，禁編造。' +
          GROUNDING_SUFFIX,
        prompt,
        { temperature: 0.2 },
      );
      return parseWithdrawalRisk(raw);
    } catch (err) {
      this.logger.error('LLM withdrawal risk failed', err);
      return this.fallback({
        amount: tx.amount,
        totalEarnings: earnings.totalEarnings,
        accountAgeDays,
        emailVerified: user?.emailVerified ?? false,
        suspiciousCount,
      });
    }
  }

  private fallback(input: {
    amount: number;
    totalEarnings: number;
    accountAgeDays: number;
    emailVerified: boolean;
    suspiciousCount: number;
  }): WithdrawalRisk {
    const flags: string[] = [];
    let score = 0;
    if (input.amount > input.totalEarnings) {
      flags.push(`提領金額 NT$${input.amount} 超過累計獎勵 NT$${input.totalEarnings}`);
      score += 50;
    }
    if (input.accountAgeDays < 3 && input.amount >= 500) {
      flags.push(`帳號僅 ${input.accountAgeDays} 天即大額提領`);
      score += 30;
    }
    if (!input.emailVerified) {
      flags.push('Email 尚未驗證');
      score += 20;
    }
    if (input.suspiciousCount >= 3) {
      flags.push(`已累積 ${input.suspiciousCount} 筆可疑填答`);
      score += 30;
    }

    const riskLevel: 'low' | 'medium' | 'high' =
      score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low';
    const recommendation: 'approve' | 'manual_review' | 'reject' =
      riskLevel === 'high' ? 'reject' : riskLevel === 'medium' ? 'manual_review' : 'approve';

    return {
      riskLevel,
      redFlags: flags,
      recommendation,
      reasoning:
        riskLevel === 'low'
          ? 'AI 服務暫時不可用。規則分析顯示此申請無明顯風險。'
          : 'AI 服務暫時不可用。規則分析發現以下風險訊號。',
    };
  }
}
