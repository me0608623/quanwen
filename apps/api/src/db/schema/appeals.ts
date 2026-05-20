import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { surveyResponses } from './responses';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const appealStatusEnum = pgEnum('appeal_status', [
  'pending',   // 已提交，待 admin 處理
  'approved',  // 申訴成功（response 被改判 + 補發獎勵）
  'dismissed', // 申訴駁回
]);

// ─── Response Appeals ─────────────────────────────────────────────────────────
// Phase 6：受試者對 rejected 的填答提出申訴

export const responseAppeals = pgTable(
  'response_appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => surveyResponses.id, { onDelete: 'cascade' }),
    respondentId: uuid('respondent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: appealStatusEnum('status').notNull().default('pending'),
    adminNote: varchar('admin_note', { length: 500 }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    respondentIdx: index('response_appeals_respondent_idx').on(t.respondentId),
    statusIdx: index('response_appeals_status_idx').on(t.status),
    // 一筆 response 只能申訴一次
    uniqResponse: unique('response_appeals_unique_response').on(t.responseId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResponseAppeal = typeof responseAppeals.$inferSelect;
export type NewResponseAppeal = typeof responseAppeals.$inferInsert;
