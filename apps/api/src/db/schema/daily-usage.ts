import {
  pgTable,
  uuid,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from './users';

// ─── Daily AI Usage ─────────────────────────────────────────────────────────────

export const dailyUsage = pgTable(
  'daily_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    usageDate: timestamp('usage_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    optimizeSurveyCount: integer('optimize_survey_count').notNull().default(0),
    generateQuestionsCount: integer('generate_questions_count').notNull().default(0),
    analyzeResponsesCount: integer('analyze_responses_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdDateIdx: index('daily_usage_user_date_idx').on(t.userId, t.usageDate),
  }),
);

// ─── Types ─────────────────────────────────────────────────────────────────────

export type DailyUsage = typeof dailyUsage.$inferSelect;
export type NewDailyUsage = typeof dailyUsage.$inferInsert;