import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ageRangeEnum = pgEnum('age_range', [
  'under_18', '18_24', '25_34', '35_44', '45_54', '55_plus',
]);

export const genderEnum = pgEnum('gender', [
  'male', 'female', 'non_binary', 'prefer_not_to_say',
]);

export const occupationEnum = pgEnum('occupation', [
  'student', 'employed_full_time', 'employed_part_time',
  'self_employed', 'unemployed', 'retired', 'homemaker', 'other',
]);

export const educationEnum = pgEnum('education', [
  'junior_high', 'senior_high', 'vocational', 'bachelor', 'master', 'phd', 'other',
]);

// ─── Respondent Profiles ──────────────────────────────────────────────────────

export const respondentProfiles = pgTable(
  'respondent_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    ageRange: ageRangeEnum('age_range'),
    gender: genderEnum('gender'),
    region: varchar('region', { length: 20 }),          // 縣市
    occupation: occupationEnum('occupation'),
    education: educationEnum('education'),
    reputationScore: integer('reputation_score').notNull().default(60),
    completionRate: numeric('completion_rate', { precision: 5, scale: 2 }).default('100.00'),
    totalCompleted: integer('total_completed').notNull().default(0),
    isOnboardingDone: boolean('is_onboarding_done').notNull().default(false),
    // Phase 5.5: 連續退件停權（null = 未停權）
    suspendedUntil: timestamp('suspended_until', { withTimezone: true }),
    suspendedReason: varchar('suspended_reason', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('respondent_profiles_user_idx').on(t.userId),
    regionIdx: index('respondent_profiles_region_idx').on(t.region),
  }),
);

// ─── Surveyor Profiles ────────────────────────────────────────────────────────

export const surveyorProfiles = pgTable(
  'surveyor_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    institutionName: varchar('institution_name', { length: 200 }),
    researchPurpose: varchar('research_purpose', { length: 500 }),
    isVerified: boolean('is_verified').notNull().default(false),
    isOnboardingDone: boolean('is_onboarding_done').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('surveyor_profiles_user_idx').on(t.userId),
  }),
);

// ─── Phase 7.1: Reputation History ────────────────────────────────────────────

export const reputationHistory = pgTable(
  'reputation_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),        // 變動量（可正可負）
    newScore: integer('new_score').notNull(), // 變動後分數
    reason: varchar('reason', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('reputation_history_user_idx').on(t.userId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type RespondentProfile = typeof respondentProfiles.$inferSelect;
export type NewRespondentProfile = typeof respondentProfiles.$inferInsert;
export type SurveyorProfile = typeof surveyorProfiles.$inferSelect;
export type NewSurveyorProfile = typeof surveyorProfiles.$inferInsert;
export type ReputationHistoryRow = typeof reputationHistory.$inferSelect;
export type NewReputationHistoryRow = typeof reputationHistory.$inferInsert;
