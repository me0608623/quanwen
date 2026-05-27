import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { surveys } from './surveys';
import { surveyResponses } from './responses';

// 配對狀態
//   waiting   — A 已發佈，等對手
//   matched   — 配對成功，兩邊都可以開始填
//   a_done    — A 已交卷 + AI 過
//   b_done    — B 已交卷 + AI 過
//   both_done — 解鎖：雙方都過
//   expired   — 72h 超時
//   cancelled — 取消或 AI 退件
export const mutualPairStatusEnum = pgEnum('mutual_pair_status', [
  'waiting',
  'matched',
  'a_done',
  'b_done',
  'both_done',
  'expired',
  'cancelled',
]);

// 配對表：A 與 B 的兩份 mutual 問卷
export const mutualPairs = pgTable(
  'mutual_pairs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: mutualPairStatusEnum('status').notNull().default('waiting'),

    // A 方
    aUserId: uuid('a_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    aSurveyId: uuid('a_survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
    // A 在 B 的問卷上的填答（A 是受試者）
    aResponseId: uuid('a_response_id').references(() => surveyResponses.id, { onDelete: 'set null' }),
    aFilledAt: timestamp('a_filled_at', { withTimezone: true }),

    // B 方 — nullable until matched
    bUserId: uuid('b_user_id').references(() => users.id, { onDelete: 'cascade' }),
    bSurveyId: uuid('b_survey_id').references(() => surveys.id, { onDelete: 'cascade' }),
    bResponseId: uuid('b_response_id').references(() => surveyResponses.id, { onDelete: 'set null' }),
    bFilledAt: timestamp('b_filled_at', { withTimezone: true }),

    // Phase C-3: 外部連結互惠的截圖證明 + 互評
    aProofUrl: text('a_proof_url'),
    bProofUrl: text('b_proof_url'),
    aRating: integer('a_rating'),   // A 給 B 的評分 1-5
    bRating: integer('b_rating'),   // B 給 A 的評分 1-5
    aRatedAt: timestamp('a_rated_at', { withTimezone: true }),
    bRatedAt: timestamp('b_rated_at', { withTimezone: true }),

    matchedAt: timestamp('matched_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // matched_at + 72h
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('mutual_pairs_status_idx').on(t.status),
    aUserIdx: index('mutual_pairs_a_user_idx').on(t.aUserId),
    bUserIdx: index('mutual_pairs_b_user_idx').on(t.bUserId),
    // 同一份 mutual survey 只能有一個「進行中」的 pair (waiting/matched/a_done/b_done)
    // cancelled/expired/both_done 不佔位, 允許 survey 重新進池
    aSurveyActiveUnique: uniqueIndex('mutual_pairs_a_survey_active_unique')
      .on(t.aSurveyId)
      .where(sql`status IN ('waiting','matched','a_done','b_done')`),
  }),
);

export type MutualPair = typeof mutualPairs.$inferSelect;
export type NewMutualPair = typeof mutualPairs.$inferInsert;
