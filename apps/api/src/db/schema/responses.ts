import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { surveys } from './surveys';
import { surveyQuestions } from './surveys';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const responseStatusEnum = pgEnum('response_status', [
  'in_progress', // 填答中（尚未提交）
  'submitted',   // 已提交，待發獎勵
  'pending_review', // 初步審核需人工複核，暫不發獎勵
  'rewarded',    // 獎勵已發放
  'rejected',    // 品質審查不通過（反作弊）
]);

export const responseSentimentEnum = pgEnum('response_sentiment', [
  'positive',
  'neutral',
  'negative',
]);

// ─── Survey Responses ─────────────────────────────────────────────────────────

export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    respondentId: uuid('respondent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: responseStatusEnum('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    // 反作弊欄位
    fillDurationSeconds: integer('fill_duration_seconds'),   // 填答耗時（秒）
    antiCheatScore: integer('anti_cheat_score'),             // 0-100，越高越可疑
    suspiciousFlags: jsonb('suspicious_flags'),              // string[] 可疑原因列表

    // Quality Audit Pipeline（Phase 1：三層管線結果）
    qualityScore: integer('quality_score'),                  // 0-100，最終加權分（越高越好）
    qualityBreakdown: jsonb('quality_breakdown'),            // QualityBreakdown 完整結構
    behaviorLog: jsonb('behavior_log'),                      // Phase 2 前端行為訊號
    // Phase 2 AI sentiment analysis result
    sentiment: responseSentimentEnum('sentiment'),
    // 防重複：每人每份問卷只能提交一次
  },
  (t) => ({
    surveyIdx: index('survey_responses_survey_idx').on(t.surveyId),
    respondentIdx: index('survey_responses_respondent_idx').on(t.respondentId),
    // 同一受試者對同一問卷只能有一筆（unique constraint）
    uniqRespondentSurvey: unique('survey_responses_unique').on(t.surveyId, t.respondentId),
  }),
);

// ─── Response Answers ─────────────────────────────────────────────────────────
// 每題答案。根據題型使用不同欄位：
//   single_choice / multiple_choice → selectedOptionIds (jsonb array of UUIDs)
//   text                            → textAnswer
//   rating                          → ratingValue
//   matrix                          → textAnswer (JSON string of row→value map)

export const responseAnswers = pgTable(
  'response_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    responseId: uuid('response_id')
      .notNull()
      .references(() => surveyResponses.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    // 反正規化（設計文件 §3-B1 / ADR-009）。NOT NULL 由 migration response-answers-survey-id-notnull.sql 強制。
    surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
    textAnswer: text('text_answer'),
    selectedOptionIds: jsonb('selected_option_ids'), // string[]
    ratingValue: integer('rating_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    responseIdx: index('response_answers_response_idx').on(t.responseId),
    questionIdx: index('response_answers_question_idx').on(t.questionId),
    // per-survey 聚合查詢用（搭配 survey_id 反正規化）
    surveyQuestionIdx: index('response_answers_survey_question_idx').on(t.surveyId, t.questionId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type NewSurveyResponse = typeof surveyResponses.$inferInsert;
export type ResponseAnswer = typeof responseAnswers.$inferSelect;
export type NewResponseAnswer = typeof responseAnswers.$inferInsert;
