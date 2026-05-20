import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const rewardTypeEnum = pgEnum('reward_type', [
  'cash',    // NT$ 現金獎勵（預設）
  'points',  // 平台積分（1 積分 = NT$0.5，不可換現金）
]);

export const surveyStatusEnum = pgEnum('survey_status', [
  'draft',       // 草稿，問券方編輯中
  'pending_review', // 送出待 AI 審核
  'published',   // 上架，受試者可填
  'paused',      // 暫停接案
  'closed',      // 截止/已達配額
  'rejected',    // AI 審核不通過
]);

export const questionTypeEnum = pgEnum('question_type', [
  'single_choice',   // 單選
  'multiple_choice', // 多選
  'text',            // 開放式文字
  'rating',          // 評分（1-N）
  'matrix',          // 矩陣題
]);

// ─── Surveys ──────────────────────────────────────────────────────────────────

export const surveys = pgTable(
  'surveys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyorId: uuid('surveyor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: surveyStatusEnum('status').notNull().default('draft'),

    // 獎勵設定
    rewardType: rewardTypeEnum('reward_type').notNull().default('cash'),
    // cash → NT$ 每份金額；points → 每份積分數量
    rewardPoints: integer('reward_points').notNull().default(0),

    // 受眾條件（JSON，儲存篩選規則）
    audienceCriteria: jsonb('audience_criteria'),

    // 配額與期限
    targetCount: integer('target_count').notNull().default(100),
    completedCount: integer('completed_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // AI 審核結果
    aiScore: integer('ai_score'),           // 0-100
    aiRejectReason: text('ai_reject_reason'),

    // 是否允許匿名填答
    isAnonymous: boolean('is_anonymous').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    surveyorIdx: index('surveys_surveyor_idx').on(t.surveyorId),
    statusIdx: index('surveys_status_idx').on(t.status),
    expiresIdx: index('surveys_expires_idx').on(t.expiresAt),
  }),
);

// ─── Survey Questions ─────────────────────────────────────────────────────────

export const surveyQuestions = pgTable(
  'survey_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
    type: questionTypeEnum('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isRequired: boolean('is_required').notNull().default(true),
    // 題型設定（rating 用 max_rating；matrix 用 row/col 設定）
    config: jsonb('config'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    surveyIdx: index('survey_questions_survey_idx').on(t.surveyId),
    orderIdx: index('survey_questions_order_idx').on(t.surveyId, t.sortOrder),
  }),
);

// ─── Question Options ─────────────────────────────────────────────────────────

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id').notNull().references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 300 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    questionIdx: index('question_options_question_idx').on(t.questionId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Survey = typeof surveys.$inferSelect;
export type NewSurvey = typeof surveys.$inferInsert;
export type SurveyQuestion = typeof surveyQuestions.$inferSelect;
export type NewSurveyQuestion = typeof surveyQuestions.$inferInsert;
export type QuestionOption = typeof questionOptions.$inferSelect;
export type NewQuestionOption = typeof questionOptions.$inferInsert;
