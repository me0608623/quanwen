import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const shopItemCategoryEnum = pgEnum('shop_item_category', [
  'voucher_711',     // 7-11 禮券
  'voucher_familymart', // 全家禮券
  'voucher_starbucks',  // 星巴克
  'voucher_general',    // 通用商店禮券
  'merchandise',     // 實體商品
]);

export const redemptionStatusEnum = pgEnum('redemption_status', [
  'issued',    // PIN code 已發放
  'used',      // 受試者已使用
  'expired',   // 已過期
  'cancelled', // 退款
]);

// ─── Items（商品目錄）─────────────────────────────────────────────────────────

export const pointShopItems = pgTable(
  'point_shop_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    category: shopItemCategoryEnum('category').notNull(),
    costPoints: integer('cost_points').notNull(),  // 兌換所需積分
    faceValue: integer('face_value').notNull(),    // 票券面額 NT$（用於記帳）
    imageUrl: varchar('image_url', { length: 500 }),
    stockQty: integer('stock_qty').notNull().default(-1),  // -1 = 無限
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    categoryIdx: index('point_shop_items_category_idx').on(t.category),
    activeIdx: index('point_shop_items_active_idx').on(t.active),
  }),
);

// ─── Redemptions（兌換紀錄 + 加密 PIN code）─────────────────────────────────

export const pointRedemptions = pgTable(
  'point_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull().references(() => pointShopItems.id, { onDelete: 'restrict' }),
    costPoints: integer('cost_points').notNull(),  // snapshot 當下費用
    faceValue: integer('face_value').notNull(),    // snapshot 票券面額
    pinCodeCipher: text('pin_code_cipher').notNull(), // AES-256-GCM 加密的 PIN/序號
    status: redemptionStatusEnum('status').notNull().default('issued'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('point_redemptions_user_idx').on(t.userId),
    userCreatedIdx: index('point_redemptions_user_created_idx').on(t.userId, t.createdAt),
    statusIdx: index('point_redemptions_status_idx').on(t.status),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type PointShopItem = typeof pointShopItems.$inferSelect;
export type NewPointShopItem = typeof pointShopItems.$inferInsert;
export type PointRedemption = typeof pointRedemptions.$inferSelect;
export type NewPointRedemption = typeof pointRedemptions.$inferInsert;
