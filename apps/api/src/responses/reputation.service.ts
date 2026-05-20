import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { respondentProfiles, reputationHistory } from '../db/schema';

/**
 * Phase 7.1: 統一的信譽分調整服務。
 * 任何修改 reputation_score 的地方都應走這裡，會自動寫一筆 reputation_history。
 */
@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 調整信譽分；自動 clamp 到 0-100，並寫一筆歷史紀錄。
   * @param userId 受試者 user id
   * @param delta  變動量（正負皆可）
   * @param reason 短描述，會顯示在 profile 趨勢圖
   * @returns 變動後分數，或 null（profile 不存在）
   */
  async adjust(userId: string, delta: number, reason: string): Promise<number | null> {
    if (delta === 0) return null;

    const rows = await this.db
      .select({
        id: respondentProfiles.id,
        reputationScore: respondentProfiles.reputationScore,
      })
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, userId))
      .limit(1);

    const profile = rows[0];
    if (!profile) return null;

    const newScore = Math.max(0, Math.min(100, profile.reputationScore + delta));
    // 若 clamp 後沒變化（例如已 100 又 +1），仍然記一筆 0 變動避免假象，但 delta 用實際變化值
    const actualDelta = newScore - profile.reputationScore;

    await this.db
      .update(respondentProfiles)
      .set({ reputationScore: newScore, updatedAt: new Date() })
      .where(eq(respondentProfiles.id, profile.id));

    if (actualDelta !== 0) {
      await this.db.insert(reputationHistory).values({
        userId,
        delta: actualDelta,
        newScore,
        reason: reason.slice(0, 200),
      });
    }

    this.logger.log(`Reputation ${userId}: ${profile.reputationScore} → ${newScore} (${reason})`);
    return newScore;
  }

  /** 取最近 N 筆歷史（給 profile mini chart 用）*/
  async getHistory(userId: string, limit = 20) {
    return this.db
      .select({
        id: reputationHistory.id,
        delta: reputationHistory.delta,
        newScore: reputationHistory.newScore,
        reason: reputationHistory.reason,
        createdAt: reputationHistory.createdAt,
      })
      .from(reputationHistory)
      .where(eq(reputationHistory.userId, userId))
      .orderBy(desc(reputationHistory.createdAt))
      .limit(limit);
  }
}
