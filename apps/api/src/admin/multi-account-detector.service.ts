import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, ne, sql, desc } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { users, transactions, kycVerifications, surveyResponses } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { CryptoService } from '../common/crypto.service';

export interface DetectionSignal {
  type: 'shared_bank_account' | 'shared_phone' | 'shared_id_number' | 'shared_ip_burst' | 'similar_behavior';
  severity: 'high' | 'medium' | 'low';
  description: string;
  relatedUserIds: string[];
  evidence?: Record<string, unknown>;
}

export interface MultiAccountReport {
  scannedUserId: string;
  generatedAt: string;
  signals: DetectionSignal[];
  riskScore: number; // 0-100，越高越可疑
  recommendation: 'safe' | 'review' | 'block';
}

/**
 * Phase D.6: 多帳號偵測。
 *
 * 比對信號：
 *   1. 同銀行帳號（transactions.metadata.bankAccountCipher 解密後）
 *   2. 同身分證號（kyc_verifications.id_number_cipher 解密後）
 *   3. 同手機（kyc 或 user.phone）
 *   4. 短時間內多次注冊（IP burst — 需 request log，先略）
 *   5. 行為相似（同一裝置 user-agent + 完答時長分布；需 behavior_log）
 *
 * 觸發時機（在 wallet/kyc 加 hook）：
 *   - withdrawal request
 *   - KYC submit
 *   - admin 手動 scan
 */
@Injectable()
export class MultiAccountDetectorService {
  private readonly logger = new Logger(MultiAccountDetectorService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly crypto: CryptoService,
  ) {}

  async scanUser(userId: string): Promise<MultiAccountReport> {
    const signals: DetectionSignal[] = [];

    // 1. 同銀行帳號
    const bankSignal = await this.detectSharedBankAccount(userId);
    if (bankSignal) signals.push(bankSignal);

    // 2. 同身分證號
    const idSignal = await this.detectSharedIdNumber(userId);
    if (idSignal) signals.push(idSignal);

    // 3. 同手機號
    const phoneSignal = await this.detectSharedPhone(userId);
    if (phoneSignal) signals.push(phoneSignal);

    // 4. 行為相似
    const behaviorSignal = await this.detectSimilarBehavior(userId);
    if (behaviorSignal) signals.push(behaviorSignal);

    // 計算 risk score
    let riskScore = 0;
    for (const s of signals) {
      if (s.severity === 'high') riskScore += 40;
      else if (s.severity === 'medium') riskScore += 20;
      else riskScore += 10;
    }
    riskScore = Math.min(100, riskScore);

    const recommendation: MultiAccountReport['recommendation'] =
      riskScore >= 80 ? 'block' :
      riskScore >= 40 ? 'review' :
      'safe';

    return {
      scannedUserId: userId,
      generatedAt: new Date().toISOString(),
      signals,
      riskScore,
      recommendation,
    };
  }

  /** withdrawal 觸發點：若高風險即通知所有 admin */
  async scanAndAlertIfRisky(userId: string, context: string): Promise<MultiAccountReport> {
    const report = await this.scanUser(userId);

    if (report.recommendation !== 'safe') {
      this.logger.warn(`多帳號偵測 ${context} userId=${userId}: ${report.recommendation} (score=${report.riskScore})`);
      await this.alertAdmins(report, context);
    }
    return report;
  }

  // ─── 各種訊號偵測 ─────────────────────────────────────────────────────────

  private async detectSharedBankAccount(userId: string): Promise<DetectionSignal | null> {
    // 取目前 user 最近的提領申請以拿到 bankAccountCipher
    const myTxns = await this.db
      .select({ metadata: transactions.metadata, createdAt: transactions.createdAt })
      .from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        eq(transactions.type, 'withdraw_request'),
        sql`metadata IS NOT NULL`,
      ))
      .orderBy(desc(transactions.createdAt))
      .limit(1);

    const myCipher = (myTxns[0]?.metadata as { bankAccountCipher?: string } | null)?.bankAccountCipher;
    if (!myCipher) return null;
    const myAccount = this.crypto.tryDecrypt(myCipher);
    if (!myAccount) return null;

    // 全表掃描所有 withdraw_request metadata，解密比對（demo 規模 OK；prod 需 hash index）
    const allTxns = await this.db
      .select({ userId: transactions.userId, metadata: transactions.metadata })
      .from(transactions)
      .where(and(
        eq(transactions.type, 'withdraw_request'),
        ne(transactions.userId, userId),
        sql`metadata IS NOT NULL`,
      ))
      .limit(500);

    const collidingUsers = new Set<string>();
    for (const t of allTxns) {
      const cipher = (t.metadata as { bankAccountCipher?: string } | null)?.bankAccountCipher;
      if (!cipher) continue;
      const account = this.crypto.tryDecrypt(cipher);
      if (account && account === myAccount) {
        collidingUsers.add(t.userId);
      }
    }

    if (collidingUsers.size === 0) return null;
    return {
      type: 'shared_bank_account',
      severity: 'high',
      description: `同銀行帳號被 ${collidingUsers.size + 1} 個用戶（含自己）使用`,
      relatedUserIds: [...collidingUsers],
      evidence: { collidingCount: collidingUsers.size + 1 },
    };
  }

  private async detectSharedIdNumber(userId: string): Promise<DetectionSignal | null> {
    const my = await this.db
      .select({ idNumberCipher: kycVerifications.idNumberCipher })
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .limit(1);
    const myCipher = my[0]?.idNumberCipher;
    if (!myCipher) return null;
    const myId = this.crypto.tryDecrypt(myCipher);
    if (!myId) return null;

    const all = await this.db
      .select({ userId: kycVerifications.userId, idNumberCipher: kycVerifications.idNumberCipher })
      .from(kycVerifications)
      .where(ne(kycVerifications.userId, userId))
      .limit(500);

    const colliding = new Set<string>();
    for (const r of all) {
      const decrypted = this.crypto.tryDecrypt(r.idNumberCipher);
      if (decrypted === myId) colliding.add(r.userId);
    }
    if (colliding.size === 0) return null;
    return {
      type: 'shared_id_number',
      severity: 'high',
      description: `同身分證號被 ${colliding.size + 1} 個用戶（含自己）KYC 用過`,
      relatedUserIds: [...colliding],
      evidence: { collidingCount: colliding.size + 1 },
    };
  }

  private async detectSharedPhone(userId: string): Promise<DetectionSignal | null> {
    const my = await this.db
      .select({ phoneCipher: kycVerifications.phoneCipher })
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .limit(1);
    const myCipher = my[0]?.phoneCipher;
    if (!myCipher) return null;
    const myPhone = this.crypto.tryDecrypt(myCipher);
    if (!myPhone) return null;

    const all = await this.db
      .select({ userId: kycVerifications.userId, phoneCipher: kycVerifications.phoneCipher })
      .from(kycVerifications)
      .where(ne(kycVerifications.userId, userId))
      .limit(500);

    const colliding = new Set<string>();
    for (const r of all) {
      const decrypted = this.crypto.tryDecrypt(r.phoneCipher);
      if (decrypted === myPhone) colliding.add(r.userId);
    }
    if (colliding.size === 0) return null;
    return {
      type: 'shared_phone',
      severity: 'medium',
      description: `同手機號被 ${colliding.size + 1} 個用戶使用（家庭共用 / 同人多帳號）`,
      relatedUserIds: [...colliding],
    };
  }

  private async detectSimilarBehavior(userId: string): Promise<DetectionSignal | null> {
    // 看 behavior_log.userAgent + perQuestionTimeMs 分布
    const mine = await this.db
      .select({ behaviorLog: surveyResponses.behaviorLog })
      .from(surveyResponses)
      .where(and(
        eq(surveyResponses.respondentId, userId),
        sql`behavior_log IS NOT NULL`,
      ))
      .orderBy(desc(surveyResponses.submittedAt))
      .limit(3);

    const myAgents = new Set<string>();
    for (const r of mine) {
      const ua = (r.behaviorLog as { userAgent?: string } | null)?.userAgent;
      if (ua) myAgents.add(ua);
    }
    if (myAgents.size === 0) return null;

    // 同 UA 但不同 user 的 count（粗略）
    const collidingUserIds = new Set<string>();
    for (const ua of myAgents) {
      // jsonb 路徑運算子用 sql 但 ua 是 binding parameter（Drizzle 會 parameterize）
      const others = await this.db
        .select({ respondentId: surveyResponses.respondentId })
        .from(surveyResponses)
        .where(and(
          ne(surveyResponses.respondentId, userId),
          sql`behavior_log->>'userAgent' = ${ua}`,
        ))
        .limit(20);
      for (const o of others) {
        collidingUserIds.add(o.respondentId);
      }
    }
    if (collidingUserIds.size < 2) return null; // 1 個共用太常見，2 個以上才警示

    return {
      type: 'similar_behavior',
      severity: 'low',
      description: `相同 user-agent 還被 ${collidingUserIds.size} 個其他用戶使用`,
      relatedUserIds: [...collidingUserIds],
    };
  }

  private async alertAdmins(report: MultiAccountReport, context: string) {
    // 用 Drizzle query builder（avoid driver-specific .rows shape）
    const admins = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));

    const signalLabels = report.signals.map((s) => s.description).join('；');

    for (const a of admins) {
      try {
        await this.notifications.create({
          userId: a.id,
          type: 'system',
          title: `⚠️ 多帳號偵測：${context}`,
          body: `userId=${report.scannedUserId.slice(0, 8)}… 風險分 ${report.riskScore}（${report.recommendation}）：${signalLabels}`,
          metadata: { report: report as unknown as Record<string, unknown>, context },
        });
      } catch (err) {
        this.logger.error(`多帳號偵測 admin 通知失敗 ${a.id}`, err);
      }
    }
  }
}
