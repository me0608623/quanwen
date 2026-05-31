import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { surveys } from './surveys';
import { surveyQuestions } from './surveys';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const logicConditionEnum = pgEnum('logic_condition', [
  'eq',        // 等於（文字完全比對 / 單選選項 ID）
  'neq',       // 不等於
  'gt',        // 大於（rating 用）
  'gte',       // 大於等於
  'lt',        // 小於
  'lte',       // 小於等於
  'contains',  // 包含（文字子字串 / 多選包含某選項）
  'not_contains', // 不包含
  'is_empty',  // 未作答
  'is_not_empty', // 已作答
]);

export const logicActionEnum = pgEnum('logic_action', [
  'show',  // 顯示目標題目（預設：隱藏，條件符合才顯示）
  'hide',  // 隱藏目標題目（預設：顯示，條件符合才隱藏）
  'skip',  // 跳到目標題目（略過中間的題）
]);

// ─── Survey Logic Rules ───────────────────────────────────────────────────────

export const surveyLogicRules = pgTable(
  'survey_logic_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    // 觸發條件的來源題目（哪一題的答案要判斷）
    triggerQuestionId: uuid('trigger_question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    // 條件運算子
    condition: logicConditionEnum('condition').notNull(),
    // 比對值（文字、選項 ID JSON array、數字字串等）
    value: text('value'),
    // 動作
    action: logicActionEnum('action').notNull().default('show'),
    // 目標題目（要顯示/隱藏/跳到的那題）
    targetQuestionId: uuid('target_question_id')
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    // 規則排序（同一 trigger 的多條規則按此排序評估）
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    surveyIdx: index('survey_logic_rules_survey_idx').on(t.surveyId),
    triggerIdx: index('survey_logic_rules_trigger_idx').on(t.triggerQuestionId),
    targetIdx: index('survey_logic_rules_target_idx').on(t.targetQuestionId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type SurveyLogicRule = typeof surveyLogicRules.$inferSelect;
export type NewSurveyLogicRule = typeof surveyLogicRules.$inferInsert;
