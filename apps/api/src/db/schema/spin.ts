import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// 轉盤抽獎次數餘額：每個 user 一列。
// 完成問卷 +1（earned_total / available），轉盤一次扣 1（available / spent_total）。
export const spinChances = pgTable('spin_chances', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 目前可用的抽獎次數
  available: integer('available').notNull().default(0),
  // 累計賺得 / 已用（純統計用，方便對帳與顯示）
  earnedTotal: integer('earned_total').notNull().default(0),
  spentTotal: integer('spent_total').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SpinChances = typeof spinChances.$inferSelect;
export type NewSpinChances = typeof spinChances.$inferInsert;

// 轉盤紀錄：每轉一次一筆（歷史用，不再每日唯一 — 一天可轉多次）
export const spinRecords = pgTable(
  'spin_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // 中的獎項 key（對應 SPIN_SEGMENTS）
    prizeKey: varchar('prize_key', { length: 40 }).notNull(),
    // 實際發出的積分
    pointsWon: integer('points_won').notNull(),
    // 哪一天轉的（YYYY-MM-DD，存 UTC+8 當地日；保留作歷史，不再唯一）
    spinDate: varchar('spin_date', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('spin_records_user_idx').on(t.userId),
  }),
);

export type SpinRecord = typeof spinRecords.$inferSelect;
export type NewSpinRecord = typeof spinRecords.$inferInsert;
