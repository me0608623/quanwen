import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq, desc, and, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  pointShopItems,
  pointRedemptions,
  wallets,
  transactions,
  journalEntries,
} from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Phase Q：積分商城
 *
 * 兌換流程：
 *  1. user 點兌換 → POST /shop/redeem/:itemId
 *  2. 驗證積分 / 庫存 / 商品 active
 *  3. db.transaction：
 *     a. 扣 wallets.pointsBalance
 *     b. 寫 transactions(type=points_spend) + journal entries（points_wallet → points_liability 反向）
 *     c. 產生 PIN code（demo: random hex；prod: 呼叫禮券供應商 API）
 *     d. 加密 PIN code，寫 point_redemptions
 *     e. stock_qty > 0 時 -1
 *  4. notification: 兌換成功，可在「我的兌換」查看 PIN
 */
@Injectable()
export class PointShopService {
  private readonly logger = new Logger(PointShopService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 列出商品（active + 有庫存）*/
  async listItems() {
    return this.db
      .select()
      .from(pointShopItems)
      .where(and(
        eq(pointShopItems.active, true),
        sql`(stock_qty = -1 OR stock_qty > 0)`,
      ))
      .orderBy(pointShopItems.sortOrder, pointShopItems.costPoints);
  }

  /** 兌換 — 完整原子化交易 */
  async redeem(userId: string, itemId: string) {
    const item = (await this.db
      .select()
      .from(pointShopItems)
      .where(eq(pointShopItems.id, itemId))
      .limit(1))[0];
    if (!item) throw new NotFoundException('商品不存在');
    if (!item.active) throw new BadRequestException('此商品已下架');
    if (item.stockQty === 0) throw new ConflictException('已售罄');

    const walletRow = (await this.db
      .select({ pointsBalance: wallets.pointsBalance })
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1))[0];
    const pointsBalance = walletRow?.pointsBalance ?? 0;
    if (pointsBalance < item.costPoints) {
      throw new BadRequestException(
        `積分不足，需要 ${item.costPoints} 點，目前 ${pointsBalance} 點`,
      );
    }

    // 產生 PIN（demo: 16 chars hex；prod 接禮券供應商 API）
    const pinPlain = this.generatePin();
    const pinCipher = this.crypto.encrypt(pinPlain);

    // 兌換有效期 6 個月
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    const redemptionId = await this.db.transaction(async (tx) => {
      // 1. 原子扣積分（WHERE points_balance >= cost 保護併發）
      const updated = await tx
        .update(wallets)
        .set({
          pointsBalance: sql`points_balance - ${item.costPoints}`,
          version: sql`version + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(wallets.userId, userId), sql`points_balance >= ${item.costPoints}`))
        .returning({ id: wallets.id });
      if (updated.length === 0) {
        throw new BadRequestException('積分扣除失敗（可能餘額已被其他交易扣掉）');
      }

      // 2. 寫 transaction
      const [txn] = await tx
        .insert(transactions)
        .values({
          userId,
          type: 'points_spend',
          amount: item.costPoints,
          status: 'success',
          note: `兌換：${item.name}`,
          relatedSurveyId: null,
          completedAt: new Date(),
          metadata: { itemId: item.id, itemName: item.name, faceValueNTD: item.faceValue },
        })
        .returning({ id: transactions.id });

      // 3. 寫 journal entries（DR points_wallet / CR points_liability — 反向 points_in）
      await tx.insert(journalEntries).values([
        { transactionId: txn.id, accountName: `points_wallet_${userId}`, debitAmount: item.costPoints, creditAmount: 0 },
        { transactionId: txn.id, accountName: 'points_liability', debitAmount: 0, creditAmount: item.costPoints },
      ]);

      // 4. 寫 redemption
      const [redemption] = await tx
        .insert(pointRedemptions)
        .values({
          userId,
          itemId: item.id,
          costPoints: item.costPoints,
          faceValue: item.faceValue,
          pinCodeCipher: pinCipher,
          status: 'issued',
          expiresAt,
        })
        .returning({ id: pointRedemptions.id });

      // 5. 庫存 -1（若非無限）
      if (item.stockQty > 0) {
        await tx
          .update(pointShopItems)
          .set({ stockQty: sql`stock_qty - 1`, updatedAt: new Date() })
          .where(eq(pointShopItems.id, item.id));
      }

      return redemption.id;
    });

    // 通知（fire-and-forget）
    void this.notifications
      .create({
        userId,
        type: 'system',
        title: `兌換成功：${item.name}`,
        body: `您消費 ${item.costPoints} 點兌換「${item.name}」（面額 NT$${item.faceValue}）。請在「我的兌換」頁查看 PIN 序號（6 個月內有效）。`,
        metadata: { redemptionId, itemId: item.id },
      })
      .catch((err) => this.logger.error('Redemption notification failed', err));

    this.logger.log(`Redemption created: user=${userId} item=${item.id} cost=${item.costPoints}`);
    return { redemptionId, message: '兌換成功' };
  }

  /** 受試者查自己的兌換歷史（含 PIN 解密）*/
  async listMyRedemptions(userId: string) {
    const rows = await this.db
      .select({
        id: pointRedemptions.id,
        itemId: pointRedemptions.itemId,
        costPoints: pointRedemptions.costPoints,
        faceValue: pointRedemptions.faceValue,
        pinCodeCipher: pointRedemptions.pinCodeCipher,
        status: pointRedemptions.status,
        expiresAt: pointRedemptions.expiresAt,
        usedAt: pointRedemptions.usedAt,
        createdAt: pointRedemptions.createdAt,
        itemName: pointShopItems.name,
        itemCategory: pointShopItems.category,
      })
      .from(pointRedemptions)
      .innerJoin(pointShopItems, eq(pointRedemptions.itemId, pointShopItems.id))
      .where(eq(pointRedemptions.userId, userId))
      .orderBy(desc(pointRedemptions.createdAt))
      .limit(50);

    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      itemName: r.itemName,
      itemCategory: r.itemCategory,
      costPoints: r.costPoints,
      faceValue: r.faceValue,
      pinCode: this.crypto.tryDecrypt(r.pinCodeCipher),  // 解密只給本人看
      status: r.status,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
      createdAt: r.createdAt,
    }));
  }

  /** PIN 標記為已使用（demo 用，prod 由禮券供應商 webhook 自動標記）*/
  async markAsUsed(userId: string, redemptionId: string) {
    const rows = await this.db
      .select()
      .from(pointRedemptions)
      .where(and(eq(pointRedemptions.id, redemptionId), eq(pointRedemptions.userId, userId)))
      .limit(1);
    const r = rows[0];
    if (!r) throw new NotFoundException('兌換紀錄不存在');
    if (r.status !== 'issued') throw new BadRequestException(`目前狀態為 ${r.status}，無法標記`);

    await this.db
      .update(pointRedemptions)
      .set({ status: 'used', usedAt: new Date() })
      .where(eq(pointRedemptions.id, redemptionId));

    return { message: '已標記為使用' };
  }

  /** 產生隨機 PIN（4 段 4 位數字格式 — 模擬禮券常見樣式）*/
  private generatePin(): string {
    const seg = () => Math.floor(parseInt(randomBytes(2).toString('hex'), 16) % 10000).toString().padStart(4, '0');
    return `${seg()}-${seg()}-${seg()}-${seg()}`;
  }
}
