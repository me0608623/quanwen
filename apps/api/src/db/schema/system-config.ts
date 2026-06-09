import { pgTable, varchar, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const systemConfig = pgTable('system_config', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  description: varchar('description', { length: 500 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export type SystemConfigRow = typeof systemConfig.$inferSelect;
