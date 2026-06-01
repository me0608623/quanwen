import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { surveys } from './surveys';
import { surveyResponses } from './responses';

export const transactionTypeEnum = pgEnum('transaction_type', [
  'deposit',          // 問券方儲值（ECPay）
  'reward_out',       // 問券方支付獎勵
  'reward_in',        // 受試者收到現金獎勵
  'platform_fee',     // 平台手續費收入
  'withdraw_request', // 受試者申請提領
  'withdraw_complete',// 實際撥款完成
  'refund',           // 退款給問券方
  'points_in',        // 受試者獲得積分
  'points_spend',     // 積分商城兌換（Phase 2）
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'processing',
  'success',
  'failed',
  'cancelled',
]);

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  cashBalance: integer('cash_balance').notNull().default(0),  // NT$ 元，integer only
  lockedCash: integer('locked_cash').notNull().default(0),    // 鎖定預算（發布問卷時）
  pointsBalance: integer('points_balance').notNull().default(0),
  version: integer('version').notNull().default(0),           // optimistic lock
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  amount: integer('amount').notNull(),   // NT$ 元，恆正
  status: transactionStatusEnum('status').notNull().default('pending'),
  // ECPay 冪等鍵（外部單號）
  externalProvider: varchar('external_provider', { length: 50 }),
  externalRef: varchar('external_ref', { length: 200 }),
  // 關聯
  relatedSurveyId: uuid('related_survey_id').references(() => surveys.id),
  relatedResponseId: uuid('related_response_id').references(() => surveyResponses.id),
  // 其他
  note: text('note'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  // 外部交易冪等：同 provider + 同 ref 只能入帳一次
  uniqueExternalRef: unique('uq_transactions_external').on(t.externalProvider, t.externalRef),
  userIdx: index('transactions_user_id_idx').on(t.userId),
  statusIdx: index('transactions_status_idx').on(t.status),
  typeIdx: index('transactions_type_idx').on(t.type),
}));

// 複式記帳分錄
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  accountName: varchar('account_name', { length: 100 }).notNull(),
  debitAmount: integer('debit_amount').notNull().default(0),
  creditAmount: integer('credit_amount').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  txnIdx: index('journal_entries_transaction_id_idx').on(t.transactionId),
  accountIdx: index('journal_entries_account_name_idx').on(t.accountName),
}));
