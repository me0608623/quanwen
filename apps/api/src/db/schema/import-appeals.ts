import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { surveys } from './surveys';

/**
 * 匯入失敗申訴：使用者自助匯入問卷失敗時，貼上問卷連結請管理員協助匯入。
 * 管理員處理後可建立一份草稿問卷歸還給申請者，於「我的問卷」看到。
 */
export const importAppeals = pgTable(
  'import_appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    surveyUrl: text('survey_url').notNull(),
    // 申請者描述（問卷主題 / 來源平台等）
    title: varchar('title', { length: 200 }),
    note: varchar('note', { length: 1000 }),
    // pending | resolved | dismissed
    status: varchar('status', { length: 16 }).notNull().default('pending'),
    adminNote: varchar('admin_note', { length: 500 }),
    // 管理員處理後建立的草稿問卷（可空）
    resolvedSurveyId: uuid('resolved_survey_id').references(() => surveys.id, { onDelete: 'set null' }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => ({
    requesterIdx: index('import_appeals_requester_idx').on(t.requesterId),
    statusIdx: index('import_appeals_status_idx').on(t.status),
  }),
);
