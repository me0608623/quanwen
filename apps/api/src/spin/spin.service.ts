import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { eq, and, gt, desc, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { spinRecords, spinChances } from '../db/schema';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * 轉盤獎項（初步設定）。
 * weight 為相對權重，總和 = 100 方便理解成百分比。
 * points 是直接發到錢包的積分。
 */
export interface SpinSegment {
  key: string;
  label: string;
  points: number;
  weight: number; // 命中機率 %
  color: string;  // 前端轉盤色塊
}

export const SPIN_SEGMENTS: SpinSegment[] = [
  { key: 'p5',     label: '5 點',        points: 5,   weight: 26, color: '#94a3b8' },
  { key: 'p10',    label: '10 點',       points: 10,  weight: 24, color: '#38bdf8' },
  { key: 'p20',    label: '20 點',       points: 20,  weight: 18, color: '#34d399' },
  { key: 'p30',    label: '30 點',       points: 30,  weight: 13, color: '#a78bfa' },
  { key: 'double', label: '2 倍！50 點', points: 50,  weight: 10, color: '#fbbf24' },
  { key: 'p100',   label: '100 點',      points: 100, weight: 5,  color: '#fb7185' },
  { key: 'zero',   label: '銘謝惠顧',     points: 0,   weight: 2,  color: '#cbd5e1' },
  { key: 'jackpot',label: '大獎 200 點', points: 200, weight: 2,  color: '#f59e0b' },
];

export interface SpinStatus {
  /** 目前可用的抽獎次數 */
  availableChances: number;
  /** 累計賺得 / 已用（顯示用） */
  earnedTotal: number;
  spentTotal: number;
  /** 是否還能轉（availableChances > 0 的便利旗標） */
  canSpin: boolean;
  /** 最近一次轉盤結果 */
  lastSpin: { prizeKey: string; pointsWon: number; spinDate: string } | null;
  segments: SpinSegment[];
}

@Injectable()
export class SpinService {
  private readonly logger = new Logger(SpinService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 台北當地日期字串 YYYY-MM-DD（UTC+8）*/
  private todayTaipei(): string {
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return now.toISOString().slice(0, 10);
  }

  /**
   * 發放抽獎次數（完成問卷時呼叫）。
   * 以 upsert 原子累加，避免併發遺失。amount 預設 1。
   */
  async grantChance(userId: string, amount = 1, reason?: string): Promise<void> {
    if (amount <= 0) return;
    await this.db
      .insert(spinChances)
      .values({ userId, available: amount, earnedTotal: amount, spentTotal: 0 })
      .onConflictDoUpdate({
        target: spinChances.userId,
        set: {
          available: sql`${spinChances.available} + ${amount}`,
          earnedTotal: sql`${spinChances.earnedTotal} + ${amount}`,
          updatedAt: new Date(),
        },
      });
    this.logger.log(`grantChance +${amount} user=${userId.slice(0, 8)}${reason ? ` (${reason})` : ''}`);
  }

  /** 取得抽獎次數與最近結果 + 轉盤格子 */
  async getStatus(userId: string): Promise<SpinStatus> {
    const chanceRows = await this.db
      .select()
      .from(spinChances)
      .where(eq(spinChances.userId, userId))
      .limit(1);
    const c = chanceRows[0];
    const available = c?.available ?? 0;

    const lastRows = await this.db
      .select()
      .from(spinRecords)
      .where(eq(spinRecords.userId, userId))
      .orderBy(desc(spinRecords.createdAt))
      .limit(1);
    const last = lastRows[0]
      ? { prizeKey: lastRows[0].prizeKey, pointsWon: lastRows[0].pointsWon, spinDate: lastRows[0].spinDate }
      : null;

    return {
      availableChances: available,
      earnedTotal: c?.earnedTotal ?? 0,
      spentTotal: c?.spentTotal ?? 0,
      canSpin: available > 0,
      lastSpin: last,
      segments: SPIN_SEGMENTS.map((s) => ({ ...s })),
    };
  }

  /** 加權隨機抽一個 segment */
  private pickSegment(): SpinSegment {
    const total = SPIN_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * total;
    for (const seg of SPIN_SEGMENTS) {
      r -= seg.weight;
      if (r <= 0) return seg;
    }
    return SPIN_SEGMENTS[0]; // fallback
  }

  /** 執行轉盤（消耗 1 次抽獎機會）*/
  async spin(userId: string): Promise<{ prizeKey: string; label: string; pointsWon: number }> {
    // 原子扣 1 次：available > 0 才會更新到，回傳 0 列代表沒次數（同時防併發重複轉）
    const consumed = await this.db
      .update(spinChances)
      .set({
        available: sql`${spinChances.available} - 1`,
        spentTotal: sql`${spinChances.spentTotal} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(spinChances.userId, userId), gt(spinChances.available, 0)))
      .returning({ available: spinChances.available });

    if (consumed.length === 0) {
      throw new BadRequestException('沒有抽獎次數囉，完成一份問卷就能再轉一次！');
    }

    const seg = this.pickSegment();

    await this.db.insert(spinRecords).values({
      userId,
      prizeKey: seg.key,
      pointsWon: seg.points,
      spinDate: this.todayTaipei(),
    });

    // 發積分
    if (seg.points > 0) {
      await this.wallet.grantPoints(userId, seg.points, `轉盤中獎：${seg.label}`);
      this.notifications
        .create({
          userId,
          type: 'reward_issued',
          title: `轉盤中獎 ${seg.points} 點！`,
          body: `轉盤轉到「${seg.label}」，${seg.points} 積分已存入錢包。`,
          metadata: { spin: true, prizeKey: seg.key, points: seg.points },
        })
        .catch((err) => this.logger.error(`spin 通知失敗 user=${userId}`, err));
    }

    this.logger.log(`Spin: user=${userId.slice(0, 8)} prize=${seg.key} points=${seg.points}`);
    return { prizeKey: seg.key, label: seg.label, pointsWon: seg.points };
  }
}
