import {
  pgTable,
  uuid,
  boolean,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { surveys } from './surveys';
import { surveyResponses } from './responses';

export interface LotteryPlatformIntervention {
  intervenedAt: string;
  adminId: string;
  reason: 'winner_issue' | 'fulfillment_overdue';
  note: string;
}

export const surveyLotteryResults = pgTable(
  'survey_lottery_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
    responseId: uuid('response_id').notNull().references(() => surveyResponses.id, { onDelete: 'cascade' }),
    respondentId: uuid('respondent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    isWinner: boolean('is_winner').notNull().default(false),
    prize: text('prize').notNull(),
    fulfillmentStatus: varchar('fulfillment_status', { length: 24 }).notNull().default('not_applicable'),
    fulfillmentNote: text('fulfillment_note'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    fulfillmentNotifiedAt: timestamp('fulfillment_notified_at', { withTimezone: true }),
    platformVerifiedAt: timestamp('platform_verified_at', { withTimezone: true }),
    platformVerifiedBy: uuid('platform_verified_by').references(() => users.id, { onDelete: 'set null' }),
    platformNote: text('platform_note'),
    platformVerifiedNotifiedAt: timestamp('platform_verified_notified_at', { withTimezone: true }),
    platformIntervenedAt: timestamp('platform_intervened_at', { withTimezone: true }),
    platformIntervenedBy: uuid('platform_intervened_by').references(() => users.id, { onDelete: 'set null' }),
    platformInterventionNote: text('platform_intervention_note'),
    platformInterventionNotifiedAt: timestamp('platform_intervention_notified_at', { withTimezone: true }),
    platformInterventionHistory: jsonb('platform_intervention_history').$type<LotteryPlatformIntervention[]>().notNull().default([]),
    lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
    drawNotifiedAt: timestamp('draw_notified_at', { withTimezone: true }),
    recipientStatus: varchar('recipient_status', { length: 24 }).notNull().default('awaiting_delivery'),
    recipientConfirmedAt: timestamp('recipient_confirmed_at', { withTimezone: true }),
    recipientConfirmedNotifiedAt: timestamp('recipient_confirmed_notified_at', { withTimezone: true }),
    recipientIssueNote: text('recipient_issue_note'),
    recipientIssueReportedAt: timestamp('recipient_issue_reported_at', { withTimezone: true }),
    recipientIssueNotifiedAt: timestamp('recipient_issue_notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    surveyIdx: index('survey_lottery_results_survey_idx').on(t.surveyId),
    respondentIdx: index('survey_lottery_results_respondent_idx').on(t.respondentId),
    uniqSurveyRespondent: unique('survey_lottery_results_unique').on(t.surveyId, t.respondentId),
  }),
);

export type SurveyLotteryResult = typeof surveyLotteryResults.$inferSelect;
