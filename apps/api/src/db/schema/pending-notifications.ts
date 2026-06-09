import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { notificationTypeEnum } from './notifications';

export const pendingNotificationStatusEnum = pgEnum('pending_notification_status', [
  'pending',
  'done',
  'failed',
]);

export const pendingNotifications = pgTable(
  'pending_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    metadata: jsonb('metadata'),
    status: pendingNotificationStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusRetryIdx: index('pending_notifications_status_retry_idx').on(t.status, t.nextRetryAt),
    userIdx: index('pending_notifications_user_idx').on(t.userId),
  }),
);

export type PendingNotification = typeof pendingNotifications.$inferSelect;
export type NewPendingNotification = typeof pendingNotifications.$inferInsert;
