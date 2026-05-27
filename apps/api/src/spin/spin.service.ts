import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { spinRecords } from '../db/schema';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * 每日轉盤獎項（初步設定）。
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

  /** 今天還能不能轉 */
  async getStatus(userId: string): Promise<{
    canSpin: boolean;
    today: string;
    lastSpin: { prizeKey: string; pointsWon: number; spinDate: string } | null;
    segments: SpinSegment[];
  }> {
    const today = this.todayTaipei();
    const rows = await this.db
      .select()
      .from(spinRecords)
      .where(and(eq(spinRecords.userId, userId), eq(spinRecords.spinDate, today)))
      .limit(1);

    const last = rows[0]
      ? { prizeKey: rows[0].prizeKey, pointsWon: rows[0].pointsWon, spinDate: rows[0].spinDate }
      : null;

    // segments 不回 weight（避免被前端拿去算機率作弊感）；只回展示用欄位
    const publicSegments = SPIN_SEGMENTS.map((s) => ({ ...s, weight: s.weight }));

    return {
      canSpin: rows.length === 0,
      today,
      lastSpin: last,
      segments: publicSegments,
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

  /** 執行轉盤（每日一次）*/
  async spin(userId: string): Promise<{ prizeKey: string; label: string; pointsWon: number }> {
    const today = this.todayTaipei();

    // 防重：今天已轉過
    const existing = await this.db
      .select({ id: spinRecords.id })
      .from(spinRecords)
      .where(and(eq(spinRecords.userId, userId), eq(spinRecords.spinDate, today)))
      .limit(1);
    if (existing.length > 0) {
      throw new BadRequestException('今天已經轉過囉，明天再來！');
    }

    const seg = this.pickSegment();

    // 寫紀錄（DB 層 race：靠 user+date 唯一性，這裡先簡單插入）
    await this.db.insert(spinRecords).values({
      userId,
      prizeKey: seg.key,
      pointsWon: seg.points,
      spinDate: today,
    });

    // 發積分
    if (seg.points > 0) {
      await this.wallet.grantPoints(userId, seg.points, `每日轉盤：${seg.label}`);
      this.notifications
        .create({
          userId,
          type: 'reward_issued',
          title: `轉盤中獎 ${seg.points} 點！`,
          body: `今日轉盤轉到「${seg.label}」，${seg.points} 積分已存入錢包。`,
          metadata: { spin: true, prizeKey: seg.key, points: seg.points },
        })
        .catch((err) => this.logger.error(`spin 通知失敗 user=${userId}`, err));
    }

    this.logger.log(`Spin: user=${userId.slice(0, 8)} prize=${seg.key} points=${seg.points}`);
    return { prizeKey: seg.key, label: seg.label, pointsWon: seg.points };
  }
}
