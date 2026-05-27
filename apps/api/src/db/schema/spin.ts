import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// 每日轉盤紀錄：一個 user 一天最多一筆
export const spinRecords = pgTable(
  'spin_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // 中的獎項 key（對應 SPIN_SEGMENTS）
    prizeKey: varchar('prize_key', { length: 40 }).notNull(),
    // 實際發出的積分
    pointsWon: integer('points_won').notNull(),
    // 哪一天轉的（用 date 字串 YYYY-MM-DD 方便每日唯一判斷，存 UTC+8 當地日）
    spinDate: varchar('spin_date', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('spin_records_user_idx').on(t.userId),
    // 一個 user 一天只能一筆（DB 層防重）
    userDateUnique: uniqueIndex('spin_records_user_date_unique').on(t.userId, t.spinDate),
  }),
);

export type SpinRecord = typeof spinRecords.$inferSelect;
export type NewSpinRecord = typeof spinRecords.$inferInsert;
